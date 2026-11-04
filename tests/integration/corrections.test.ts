import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { migrate } from "../../src/server/db";
import type { RecipeInput } from "../../src/features/recipes/validation";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `corrections_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE cookbook_entries, recipes, members, media_assets, upload_intents, content_audit CASCADE");
  const { parseManifest } = await import("../../src/features/cookbook/manifest");
  const { importCookbook } = await import("../../src/features/cookbook/importer");
  const parsed = parseManifest(JSON.parse(readFileSync("tests/fixtures/cookbook-sample.json", "utf8")));
  if (!parsed.ok) throw new Error(parsed.error.message);
  await importCookbook(pool, parsed.value);
});
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

async function people() {
  const { createAccountService } = await import("../../src/features/accounts/service");
  const accounts = createAccountService({ pool, origin: "https://recipes.example", verifyIdentity: async () => null });
  const ensure = (subject: string) => accounts.ensureMember({ provider: "clerk", subject, email: `${subject}@example.com`, emailVerified: true });
  const admin = await ensure("fix-admin");
  const member = await ensure("fix-member");
  await pool.query("UPDATE members SET onboarded_at=now(), display_name='Cook'");
  await pool.query("UPDATE members SET role='admin' WHERE id=$1", [admin.id]);
  return { admin: { ...admin, role: "admin" as const, onboarded: true }, member: { ...member, onboarded: true } };
}
const services = async () => {
  const { createCookbookCorrections } = await import("../../src/features/cookbook/corrections");
  const { createCookbookQueue } = await import("../../src/features/cookbook/queue");
  return { fix: createCookbookCorrections({ pool }), queue: createCookbookQueue({ pool }) };
};
async function entry(key: string) {
  const row = (await pool.query("SELECT e.id,r.version,r.input FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id WHERE e.import_key=$1", [key])).rows[0];
  return { id: row.id as string, version: row.version as number, input: row.input as RecipeInput };
}
async function asset(ownerId: string) {
  const intent = randomUUID(), id = randomUUID();
  await pool.query("INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',1,$3,now(),now())", [intent, ownerId, `/private/${intent}.webp`]);
  await pool.query("INSERT INTO media_assets(id,intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,'recipe',$4,$4,100,640,480)", [id, intent, ownerId, `/private/${intent}.webp`]);
  return id;
}
const complete = (input: RecipeInput): RecipeInput => ({
  ...input,
  category: "beverages",
  origin: "not-sure",
  baseline: 8,
  baselineConfirmed: true,
  timing: { mode: "total", total: 10, prep: null, cook: null, rest: null },
});
const photo = (assetId: string) => ({ assetId, caption: "Agua de limón en una jarra", alt: "", crop: { x: 50, y: 50, zoom: 1 } });
const unsplash = { kind: "stock" as const, photographer: "Sample Photographer", sourceUrl: "https://unsplash.com/photos/sample-123", license: "Unsplash License", retrievedOn: "2026-11-01", cropping: "Centered 4:3 crop" };

test("admins fill in missing fields with a reason, and the change is audited", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  const reason = "Contributor confirmed 10 minutes and 8 servings";
  const fixed = await fix.correctEntry(admin, lime.id, { version: lime.version, input: complete(lime.input), reason });
  if (!fixed.ok) throw new Error(JSON.stringify(fixed.error));
  expect(fixed.value).toMatchObject({ version: lime.version + 1, textReview: "pending", imageReview: "missing" });
  const row = (await queue.listQueue(admin, "all")).ok && (await queue.listQueue(admin, "all"));
  const listed = row && row.ok ? row.value.find((r) => r.entryId === lime.id)! : null;
  expect(listed?.missing).toEqual(["photos", "text-review", "image-review"]);
  const audit = (await pool.query("SELECT actor_id,action,target_id,details FROM content_audit")).rows;
  expect(audit).toEqual([{ actor_id: admin.id, action: "cookbook_corrected", target_id: lime.id, details: { version: lime.version + 1, reason, fields: "baseline,baselineConfirmed,category,origin,timing" } }]);
});

test("corrections need an admin, a reason and the version the admin saw", async () => {
  const { admin, member } = await people();
  const { fix } = await services();
  const lime = await entry("p03-sample-lime-water");
  const input = complete(lime.input);
  expect(await fix.correctEntry(member, lime.id, { version: lime.version, input, reason: "x" })).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await fix.correctEntry(admin, lime.id, { version: lime.version, input, reason: "   " })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await fix.correctEntry(admin, lime.id, { version: lime.version, input, reason: "y".repeat(401) })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await fix.correctEntry(admin, lime.id, { version: lime.version - 1, input, reason: "Fix" })).toMatchObject({ ok: false, error: { status: 409 } });
  expect(await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...input, origin: "atlantis" }, reason: "Fix" })).toMatchObject({ ok: false, error: { status: 422 } });
});

test("corrections fix wording but cannot add, remove or retype rows", async () => {
  const { admin } = await people();
  const { fix } = await services();
  const stew = await entry("p05-sample-bean-stew");
  const added = { ...stew.input, ingredients: [...stew.input.ingredients, { kind: "ingredient" as const, quantity: "1", unit: "", name: "sal", notes: "" }] };
  expect(await fix.correctEntry(admin, stew.id, { version: stew.version, input: added, reason: "Fix" })).toMatchObject({ ok: false, error: { status: 422 } });
  const removed = { ...stew.input, instructions: [] };
  expect(await fix.correctEntry(admin, stew.id, { version: stew.version, input: removed, reason: "Fix" })).toMatchObject({ ok: false, error: { status: 422 } });
  const retyped = { ...stew.input, ingredients: stew.input.ingredients.map((i, n) => (n === 0 ? { ...i, kind: "ingredient" as const } : i)) };
  expect(await fix.correctEntry(admin, stew.id, { version: stew.version, input: retyped, reason: "Fix" })).toMatchObject({ ok: false, error: { status: 422 } });
  const spelled = { ...stew.input, ingredients: stew.input.ingredients.map((i, n) => (n === 1 ? { ...i, name: "frijoles pintos" } : i)) };
  expect((await fix.correctEntry(admin, stew.id, { version: stew.version, input: spelled, reason: "Spelling" })).ok).toBe(true);
});

test("correcting reviewed text sends it back for review and outdates approved translations", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  expect((await queue.markTextReviewed(admin, lime.id, lime.version)).ok).toBe(true);
  const recipeId = (await pool.query("SELECT recipe_id FROM cookbook_entries WHERE id=$1", [lime.id])).rows[0].recipe_id;
  await pool.query("INSERT INTO recipe_translations(recipe_id,language,source_version,status,input,approved_by) VALUES($1,'es',$2,'approved','{}',$3)", [recipeId, lime.version, admin.id]);
  const fixed = await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...lime.input, title: "Sample Limewater" }, reason: "Spelling" });
  expect(fixed).toMatchObject({ ok: true, value: { textReview: "pending" } });
  expect((await pool.query("SELECT status FROM recipe_translations WHERE recipe_id=$1", [recipeId])).rows).toEqual([{ status: "outdated" }]);
});

test("photos must be the admin's own ready recipe uploads and changing them reopens image review", async () => {
  const { admin, member } = await people();
  const { fix } = await services();
  const lime = await entry("p03-sample-lime-water");
  const theirs = await asset(member.id);
  expect(await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...lime.input, photos: [photo(theirs)] }, reason: "Photo" })).toMatchObject({ ok: false, error: { status: 403 } });
  const mine = await asset(admin.id);
  const added = await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...lime.input, photos: [photo(mine)] }, reason: "Photo" });
  expect(added).toMatchObject({ ok: true, value: { imageReview: "pending", textReview: "pending" } });
  expect((await pool.query("SELECT reference_id FROM media_references WHERE asset_id=$1", [mine])).rows).toHaveLength(1);
  const now = await entry("p03-sample-lime-water");
  const cleared = await fix.correctEntry(admin, lime.id, { version: now.version, input: { ...now.input, photos: [] }, reason: "Wrong dish" });
  expect(cleared).toMatchObject({ ok: true, value: { imageReview: "missing" } });
  expect((await pool.query("SELECT 1 FROM media_references WHERE asset_id=$1", [mine])).rowCount).toBe(0);
});

test("photo credits record source and licence, and derive the label", async () => {
  const { admin } = await people();
  const { fix } = await services();
  const lime = await entry("p03-sample-lime-water");
  const [stock, ai, own] = [await asset(admin.id), await asset(admin.id), await asset(admin.id)];
  await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...lime.input, photos: [photo(stock), photo(ai), photo(own)] }, reason: "Photos" });
  const { version } = await entry("p03-sample-lime-water");
  const credit = (assetId: string, value: unknown) => fix.recordPhotoCredit(admin, lime.id, { version, assetId, credit: value });
  expect(await credit(stock, { ...unsplash, sourceUrl: "https://example.com/photo" })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await credit(stock, { ...unsplash, license: "" })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await credit(stock, { ...unsplash, retrievedOn: "2999-01-01" })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await credit(stock, { ...unsplash, label: "none" })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await credit(randomUUID(), unsplash)).toMatchObject({ ok: false, error: { status: 404 } });
  expect((await credit(stock, unsplash)).ok).toBe(true);
  expect((await credit(ai, { kind: "ai", license: "Generator terms reviewed 2026-11-01" })).ok).toBe(true);
  expect((await credit(own, { kind: "owner", photographer: "Sample Contributor A", license: "Emailed permission 2026-10-30" })).ok).toBe(true);
  const rows = (await pool.query("SELECT asset_id,kind,label,photographer FROM photo_credits ORDER BY kind")).rows;
  expect(rows.map((r) => [r.asset_id, r.label])).toEqual([[ai, "ai-illustrative"], [own, "none"], [stock, "illustrative"]]);
});

test("images are approved only when every photo is credited, after which the entry publishes", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  expect(await fix.markImagesReviewed(admin, lime.id, lime.version)).toMatchObject({ ok: false, error: { status: 409 } });
  const shot = await asset(admin.id);
  await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...complete(lime.input), photos: [photo(shot)] }, reason: "Complete entry" });
  const { version } = await entry("p03-sample-lime-water");
  expect(await fix.markImagesReviewed(admin, lime.id, version)).toMatchObject({ ok: false, error: { status: 409 } });
  expect((await fix.recordPhotoCredit(admin, lime.id, { version, assetId: shot, credit: unsplash })).ok).toBe(true);
  expect(await fix.markImagesReviewed(admin, lime.id, version - 1)).toMatchObject({ ok: false, error: { status: 409 } });
  expect(await fix.markImagesReviewed(admin, lime.id, version)).toMatchObject({ ok: true, value: { imageReview: "approved" } });
  // Changing a credit after approval reopens the review.
  expect(await fix.recordPhotoCredit(admin, lime.id, { version, assetId: shot, credit: { ...unsplash, cropping: "Square" } })).toMatchObject({ ok: true, value: { imageReview: "pending" } });
  expect((await fix.markImagesReviewed(admin, lime.id, version)).ok).toBe(true);
  expect((await queue.markTextReviewed(admin, lime.id, version)).ok).toBe(true);
  const published = await queue.publishImported(admin, lime.id);
  expect(published.ok).toBe(true);
  expect(await fix.correctEntry(admin, lime.id, { version: version + 1, input: complete(lime.input), reason: "Late fix" })).toMatchObject({ ok: false, error: { status: 409 } });
  const actions = (await pool.query("SELECT action FROM content_audit ORDER BY created_at")).rows.map((r) => r.action);
  expect(actions).toEqual(expect.arrayContaining(["photo_credit_recorded", "cookbook_images_reviewed"]));
});

test("readers see photo credits only on published recipes", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  const shot = await asset(admin.id);
  await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...complete(lime.input), photos: [photo(shot)] }, reason: "Complete entry" });
  const { version } = await entry("p03-sample-lime-water");
  await fix.recordPhotoCredit(admin, lime.id, { version, assetId: shot, credit: unsplash });
  const recipeId = (await pool.query("SELECT recipe_id FROM cookbook_entries WHERE id=$1", [lime.id])).rows[0].recipe_id;
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  const catalog = createCatalogService({ pool });
  expect(await catalog.photoCredits(recipeId)).toEqual({});
  await fix.markImagesReviewed(admin, lime.id, version);
  await queue.markTextReviewed(admin, lime.id, version);
  await queue.publishImported(admin, lime.id);
  expect(await catalog.photoCredits(recipeId)).toEqual({ [shot]: { kind: "stock", photographer: "Sample Photographer", site: "Unsplash", label: "illustrative" } });
});

test("uncredited photos show as a blocker alongside everything else still missing", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  const shot = await asset(admin.id);
  await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...lime.input, photos: [photo(shot)] }, reason: "Photo" });
  const page = await queue.listQueue(admin, "all");
  const listed = page.ok ? page.value.find((r) => r.entryId === lime.id)! : null;
  expect(listed?.missing).toContain("photo-credit");
  expect(listed?.missing).toContain("text-review");
});

test("a recipe adapted from a website stays blocked until an admin records how reuse was cleared", async () => {
  const { admin, member } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  const shot = await asset(admin.id);
  await pool.query("UPDATE cookbook_entries SET flags=array_append(flags,'third-party-source') WHERE id=$1", [lime.id]);
  await fix.correctEntry(admin, lime.id, { version: lime.version, input: { ...complete(lime.input), photos: [photo(shot)] }, reason: "Complete entry" });
  const { version } = await entry("p03-sample-lime-water");
  await fix.recordPhotoCredit(admin, lime.id, { version, assetId: shot, credit: unsplash });
  await fix.markImagesReviewed(admin, lime.id, version);
  await queue.markTextReviewed(admin, lime.id, version);
  const blocked = await queue.publishImported(admin, lime.id);
  expect(!blocked.ok && blocked.error.fields?.map((f) => f.field)).toEqual(["source-permission"]);
  expect(await fix.clearSource(member, lime.id, { version, note: "Asked" })).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await fix.clearSource(admin, lime.id, { version, note: "   " })).toMatchObject({ ok: false, error: { status: 422 } });
  expect(await fix.clearSource(admin, lime.id, { version: version - 1, note: "Asked" })).toMatchObject({ ok: false, error: { status: 409 } });
  const note = "Site owner agreed by email on 2026-11-01";
  expect((await fix.clearSource(admin, lime.id, { version, note })).ok).toBe(true);
  const page = await queue.listQueue(admin, "all");
  const listed = page.ok ? page.value.find((r) => r.entryId === lime.id)! : null;
  expect(listed).toMatchObject({ sourceClearance: "cleared", sourceNote: note, missing: [], eligible: true });
  expect((await queue.publishImported(admin, lime.id)).ok).toBe(true);
  const audit = (await pool.query("SELECT details FROM content_audit WHERE action='cookbook_source_cleared'")).rows;
  expect(audit).toEqual([{ details: { version, note } }]);
});

test("recipes without an outside source need no clearance and can't record one", async () => {
  const { admin } = await people();
  const { fix, queue } = await services();
  const lime = await entry("p03-sample-lime-water");
  const page = await queue.listQueue(admin, "all");
  expect(page.ok && page.value.find((r) => r.entryId === lime.id)).toMatchObject({ sourceClearance: "not-needed" });
  expect(await fix.clearSource(admin, lime.id, { version: lime.version, note: "Asked" })).toMatchObject({ ok: false, error: { status: 409 } });
});
