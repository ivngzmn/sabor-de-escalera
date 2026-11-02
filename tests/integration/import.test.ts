import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { migrate } from "../../src/server/db";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `cookbook_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const sample = () => JSON.parse(readFileSync("tests/fixtures/cookbook-sample.json", "utf8"));

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE cookbook_entries, recipes, members CASCADE");
});
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

async function load(json: unknown) {
  const { parseManifest } = await import("../../src/features/cookbook/manifest");
  const { importCookbook } = await import("../../src/features/cookbook/importer");
  const parsed = parseManifest(json);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  return importCookbook(pool, parsed.value);
}

test("every manifest entry is accounted for", async () => {
  expect(await load(sample())).toEqual({ created: 3, updated: 0, skippedReviewed: 0 });
  const rows = (await pool.query("SELECT r.state,r.owner_id,e.book_pages,e.contributor,e.original_author,e.source_urls FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id ORDER BY e.import_key")).rows;
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.state === "draft" && r.owner_id === null)).toBe(true);
  expect(rows[1]).toMatchObject({ book_pages: [5, 6], contributor: "Sample Contributor B", original_author: "Sample Grandparent", source_urls: ["https://example.org/sample-video"] });
});

test("rerun is idempotent", async () => {
  await load(sample());
  expect(await load(sample())).toEqual({ created: 0, updated: 0, skippedReviewed: 0 });
  const changed = sample();
  changed[0].recipe.title = "Sample Lime Water (corrected spelling)";
  expect(await load(changed)).toEqual({ created: 0, updated: 1, skippedReviewed: 0 });
});

test("reimport never overwrites reviewed entries", async () => {
  await load(sample());
  await pool.query("UPDATE cookbook_entries SET text_review='approved' WHERE import_key='p03-sample-lime-water'");
  const changed = sample();
  changed[0].recipe.title = "Should not land";
  expect(await load(changed)).toEqual({ created: 0, updated: 0, skippedReviewed: 1 });
  const title = (await pool.query("SELECT r.input->>'title' AS t FROM recipes r JOIN cookbook_entries e ON e.recipe_id=r.id WHERE e.import_key='p03-sample-lime-water'")).rows[0].t;
  expect(title).toBe("Sample Lime Water");
});

test("ambiguous values stay flagged", async () => {
  await load(sample());
  const row = (await pool.query("SELECT e.flags,r.input FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id WHERE e.import_key='p05-sample-bean-stew'")).rows[0];
  expect(row.flags).toEqual(["yield-unclear", "quantity-unclear:1"]);
  expect(row.input.ingredients[1].quantity).toBe("1 can (size not given)");
  expect(row.input.language).toBe("es");
  expect(row.input.category).toBe("");
});

test("imported recipes are not public", async () => {
  await load(sample());
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  const page = await createCatalogService({ pool }).list({ language: "en" }, null);
  expect(page.ok && page.value.items).toEqual([]);
});

test("rejects invalid manifests", async () => {
  const { parseManifest } = await import("../../src/features/cookbook/manifest");
  const unsafe = sample();
  unsafe[0].sourceUrls = ["javascript:alert(1)"];
  expect(parseManifest(unsafe)).toMatchObject({ ok: false });
  const duplicate = sample();
  duplicate[1].key = duplicate[0].key;
  expect(parseManifest(duplicate)).toMatchObject({ ok: false });
  const injected = sample();
  injected[0].recipe.photos = [{ assetId: randomUUID(), caption: "x", alt: "", crop: { x: 0, y: 0, zoom: 1 } }];
  expect(parseManifest(injected)).toMatchObject({ ok: false });
  expect(parseManifest({ not: "an array" })).toMatchObject({ ok: false });
});

async function people() {
  const { createAccountService } = await import("../../src/features/accounts/service");
  const accounts = createAccountService({ pool, origin: "https://recipes.example", verifyIdentity: async () => null });
  const ensure = (subject: string) =>
    accounts.ensureMember({ provider: "clerk", subject, email: `${subject}@example.com`, emailVerified: true });
  const admin = await ensure("queue-admin");
  const member = await ensure("queue-member");
  await pool.query("UPDATE members SET onboarded_at=now(), display_name='Cook'");
  await pool.query("UPDATE members SET role='admin' WHERE id=$1", [admin.id]);
  return { admin: { ...admin, role: "admin" as const, onboarded: true }, member: { ...member, onboarded: true } };
}
async function queue() {
  const { createCookbookQueue } = await import("../../src/features/cookbook/queue");
  return createCookbookQueue({ pool });
}
const entryId = async (key: string) =>
  (await pool.query("SELECT id FROM cookbook_entries WHERE import_key=$1", [key])).rows[0].id as string;

test("queue shows missing data and flags", async () => {
  await load(sample());
  const { admin } = await people();
  const page = await (await queue()).listQueue(admin, "all");
  if (!page.ok) throw new Error(page.error.message);
  const stew = page.value.find((r) => r.key === "p05-sample-bean-stew")!;
  expect(stew).toMatchObject({ pages: [5, 6], textReview: "pending", imageReview: "missing", eligible: false, flags: ["yield-unclear", "quantity-unclear:1"], translation: { en: "none" } });
  expect(stew.missing).toEqual(expect.arrayContaining(["category", "photos", "text-review", "image-review"]));
  const blocked = await (await queue()).listQueue(admin, "eligible");
  expect(blocked.ok && blocked.value).toEqual([]);
});

test("only admins see the queue", async () => {
  await load(sample());
  const { member } = await people();
  const q = await queue();
  expect(await q.listQueue(null, "all")).toMatchObject({ ok: false, error: { status: 401 } });
  expect(await q.listQueue(member, "all")).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await q.markTextReviewed(member, await entryId("p03-sample-lime-water"), 1)).toMatchObject({ ok: false, error: { status: 403 } });
});

test("publication is blocked until text, image and required fields are complete", async () => {
  await load(sample());
  const { admin } = await people();
  const q = await queue();
  const id = await entryId("p03-sample-lime-water");
  const blocked = await q.publishImported(admin, id);
  expect(blocked).toMatchObject({ ok: false, error: { status: 409 } });
  expect(!blocked.ok && blocked.error.fields?.map((f) => f.field)).toEqual(expect.arrayContaining(["text-review", "image-review", "photos"]));
});

test("an eligible entry publishes with cookbook credit and appears in the catalog", async () => {
  await load(sample());
  const { admin } = await people();
  const q = await queue();
  const id = await entryId("p05-sample-bean-stew");
  const intent = randomUUID(), asset = randomUUID();
  await pool.query(
    "INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',1,$3,now(),now())",
    [intent, admin.id, `/${intent}`],
  );
  await pool.query(
    "INSERT INTO media_assets(id,intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,'recipe',$4,$4,100,640,480)",
    [asset, intent, admin.id, `/${intent}`],
  );
  // A photo without a recorded credit/licence is not publishable.
  await pool.query(
    `UPDATE recipes SET input = input || jsonb_build_object('category','main','origin','not-sure','yieldText','6 porciones','baseline',6,'baselineConfirmed',true,
      'timing',jsonb_build_object('mode','total','total',90,'prep',null,'cook',null,'rest',null),
      'photos',jsonb_build_array(jsonb_build_object('assetId',$2::text,'caption','Guiso servido','alt','','crop',jsonb_build_object('x',50,'y',50,'zoom',1))))
     WHERE id=(SELECT recipe_id FROM cookbook_entries WHERE id=$1)`,
    [id, asset],
  );
  expect((await q.markTextReviewed(admin, id, (await pool.query("SELECT r.version FROM recipes r JOIN cookbook_entries e ON e.recipe_id=r.id WHERE e.id=$1", [id])).rows[0].version)).ok).toBe(true);
  await pool.query("UPDATE cookbook_entries SET image_review='approved' WHERE id=$1", [id]);
  const uncredited = await q.publishImported(admin, id);
  expect(!uncredited.ok && uncredited.error.fields?.map((f) => f.field)).toEqual(["photo-credit"]);
  await pool.query("INSERT INTO photo_credits(asset_id,kind,photographer,license,label) VALUES($1,'owner','Sample Contributor B','owner permission','none')", [asset]);
  const published = await q.publishImported(admin, id);
  if (!published.ok) throw new Error(JSON.stringify(published.error));
  expect(published.value.url).toMatch(/^\/recipes\/[0-9a-f-]+\/guiso-de-ejemplo$/);
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  const catalog = createCatalogService({ pool });
  const page = await catalog.list({ q: "guiso", language: "es" }, null);
  expect(page.ok && page.value.items.map((r) => [r.title, r.authorName])).toEqual([["Guiso de ejemplo", null]]);
  expect(await catalog.cookbookCredit(published.value.id)).toEqual({ contributor: "Sample Contributor B", originalAuthor: "Sample Grandparent" });
});

test("re-import outdates approved translations under changed text", async () => {
  await load(sample());
  const { admin } = await people();
  const recipeId = (await pool.query("SELECT recipe_id FROM cookbook_entries WHERE import_key='p03-sample-lime-water'")).rows[0].recipe_id;
  const version = (await pool.query("SELECT version FROM recipes WHERE id=$1", [recipeId])).rows[0].version;
  const { createTranslationService } = await import("../../src/features/translations/service");
  const translations = createTranslationService({ pool });
  const saved = await translations.saveTranslation(admin, recipeId, "es", version, {
    title: "Agua de limón de ejemplo", story: "", notes: "", yieldText: "8 tazas",
    ingredients: [{ name: "limones", notes: "", unit: "" }, { name: "azúcar", notes: "", unit: "" }],
    instructions: [{ text: "Exprimir los limones." }], captions: [],
  });
  if (!saved.ok) throw new Error(saved.error.message);
  await translations.approveTranslations(admin, [{ id: saved.value.id, sourceVersion: version }]);
  const changed = sample();
  changed[0].recipe.ingredients.splice(1, 0, { kind: "ingredient", quantity: "8", unit: "cups", name: "water", notes: "" });
  expect(await load(changed)).toEqual({ created: 0, updated: 1, skippedReviewed: 0 });
  expect(await translations.readerTranslation(recipeId, "es")).toBeNull();
});

test("text review is bound to the version the admin saw", async () => {
  await load(sample());
  const { admin } = await people();
  const q = await queue();
  const id = await entryId("p03-sample-lime-water");
  const seen = (await pool.query("SELECT r.version FROM recipes r JOIN cookbook_entries e ON e.recipe_id=r.id WHERE e.id=$1", [id])).rows[0].version;
  const changed = sample();
  changed[0].recipe.title = "Sample Lime Water, corrected";
  await load(changed);
  expect(await q.markTextReviewed(admin, id, seen)).toMatchObject({ ok: false, error: { status: 409 } });
  expect((await q.markTextReviewed(admin, id, seen + 1)).ok).toBe(true);
});

test("suspended admins are refused and owners are allowed", async () => {
  await load(sample());
  const { admin, member } = await people();
  const q = await queue();
  await pool.query("UPDATE members SET suspended=true WHERE id=$1", [admin.id]);
  expect(await q.listQueue(admin, "all")).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query("UPDATE members SET role='owner' WHERE id=$1", [member.id]);
  expect((await q.listQueue({ ...member, role: "owner" }, "all")).ok).toBe(true);
});

test("cookbook review and publication actions are audited", async () => {
  await load(sample());
  const { admin } = await people();
  const q = await queue();
  const id = await entryId("p03-sample-lime-water");
  const version = (await pool.query("SELECT r.version FROM recipes r JOIN cookbook_entries e ON e.recipe_id=r.id WHERE e.id=$1", [id])).rows[0].version;
  await q.markTextReviewed(admin, id, version);
  expect((await pool.query("SELECT actor_id,action,target_id FROM content_audit")).rows).toEqual([{ actor_id: admin.id, action: "cookbook_text_reviewed", target_id: id }]);
});
