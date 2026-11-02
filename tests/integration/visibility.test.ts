import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { migrate } from "../../src/server/db";
import { createAccountService, type Actor } from "../../src/features/accounts/service";
import { publishedRecipe, rate } from "./catalog-fixtures";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `visibility_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
let author: Actor;
let raters: Actor[];

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE members CASCADE");
  const accounts = createAccountService({ pool, origin: "https://recipes.example", verifyIdentity: async () => null });
  const member = (subject: string) =>
    accounts.ensureMember({ provider: "clerk", subject, email: `${subject}@example.com`, emailVerified: true });
  author = await member("author");
  raters = await Promise.all(["r1", "r2", "r3"].map(member));
  await pool.query("UPDATE members SET onboarded_at=now(), display_name='Cook'");
});
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

async function catalog() {
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  return createCatalogService({ pool });
}
function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

test("search ignores accents and matches partial ingredient words", async () => {
  const id = await publishedRecipe(pool, author.id, {
    title: "Poppers",
    ingredients: [{ kind: "ingredient", quantity: "6", unit: "", name: "jalapeño peppers", notes: "" }],
  });
  await publishedRecipe(pool, author.id, { title: "Flan" });
  const svc = await catalog();
  expect(ids(value(await svc.list({ q: "jalap", language: "en" }, null)))).toEqual([id]);
  expect(ids(value(await svc.list({ q: "JALAPENO", language: "en" }, null)))).toEqual([id]);
});

test("exact title ranks first in relevance", async () => {
  const older = await publishedRecipe(pool, author.id, { title: "Flan" }, ago(60));
  const newer = await publishedRecipe(pool, author.id, { title: "Flan de coco" }, ago(1));
  const svc = await catalog();
  expect(ids(value(await svc.list({ q: "flan", language: "en" }, null)))).toEqual([older, newer]);
  expect(ids(value(await svc.list({ q: "flan", sort: "newest", language: "en" }, null)))).toEqual([newer, older]);
});

test("search treats LIKE metacharacters literally", async () => {
  await publishedRecipe(pool, author.id, { title: "Rice pudding" });
  const percent = await publishedRecipe(pool, author.id, { title: "50% less sugar cake" });
  const svc = await catalog();
  expect(ids(value(await svc.list({ q: "50%", language: "en" }, null)))).toEqual([percent]);
  expect(ids(value(await svc.list({ q: "_", language: "en" }, null)))).toEqual([]);
  expect(value(await svc.list({ q: "x".repeat(5000), language: "en" }, null)).items).toEqual([]);
});

test("filters by category, origin, time and dietary tag", async () => {
  const quick = await publishedRecipe(pool, author.id, { category: "desserts", dietary: ["vegan"], timing: { mode: "total", total: 20, prep: null, cook: null, rest: null } });
  await publishedRecipe(pool, author.id, { category: "desserts", timing: { mode: "parts", total: null, prep: 30, cook: 60, rest: null } });
  await publishedRecipe(pool, author.id, { category: "main", origin: "fusion" });
  const svc = await catalog();
  expect(ids(value(await svc.list({ category: "desserts", maxMinutes: 30, language: "en" }, null)))).toEqual([quick]);
  expect(ids(value(await svc.list({ diet: "vegan", language: "en" }, null)))).toEqual([quick]);
  expect(value(await svc.list({ origin: "fusion", language: "en" }, null)).items).toHaveLength(1);
});

test("highest rated requires three ratings", async () => {
  const a = await publishedRecipe(pool, author.id, { title: "A" }, ago(30));
  const b = await publishedRecipe(pool, author.id, { title: "B" }, ago(20));
  const c = await publishedRecipe(pool, author.id, { title: "C" }, ago(10));
  await rate(pool, a, raters.map((r) => r.id), [4, 4, 4]);
  await rate(pool, b, raters.slice(0, 2).map((r) => r.id), [5, 5]);
  const svc = await catalog();
  const page = value(await svc.list({ sort: "rated", language: "en" }, null));
  expect(ids(page)).toEqual([a, c, b]);
  expect(page.items[0]).toMatchObject({ ratingAverage: 4, ratingCount: 3 });
  expect(page.items[2]).toMatchObject({ ratingAverage: 5, ratingCount: 2 });
});

test("cursor pages never duplicate", async () => {
  const same = new Date();
  for (let i = 0; i < 30; i++) await publishedRecipe(pool, author.id, { title: `Recipe ${i}` }, i % 3 ? ago(i) : same);
  const svc = await catalog();
  for (const sort of ["newest", "saved", "rated"] as const) {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = value(await svc.list({ sort, cursor, language: "en" }, null));
      expect(page.items.length).toBeLessThanOrEqual(12);
      seen.push(...ids(page));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  }
});

test("rejects malformed or mismatched cursors", async () => {
  for (let i = 0; i < 13; i++) await publishedRecipe(pool, author.id, { title: `R${i}` });
  const svc = await catalog();
  const first = value(await svc.list({ language: "en" }, null));
  expect(first.nextCursor).toBeTypeOf("string");
  expect(await svc.list({ cursor: "not-a-cursor", language: "en" }, null)).toMatchObject({ ok: false, error: { status: 400 } });
  expect(await svc.list({ cursor: first.nextCursor!, sort: "saved", language: "en" }, null)).toMatchObject({ ok: false, error: { status: 400 } });
});

test("unpublished hidden and deleted recipes leave every public list", async () => {
  const visible = await publishedRecipe(pool, author.id, { title: "Visible soup" });
  for (const state of ["unpublished", "hidden", "deleted"]) {
    const gone = await publishedRecipe(pool, author.id, { title: `Gone soup ${state}` });
    await pool.query("UPDATE recipes SET state=$2 WHERE id=$1", [gone, state]);
  }
  const svc = await catalog();
  expect(ids(value(await svc.list({ language: "en" }, null)))).toEqual([visible]);
  expect(ids(value(await svc.list({ q: "soup", language: "en" }, null)))).toEqual([visible]);
  expect(ids(value(await svc.list({ scope: { kind: "author", memberId: author.id }, language: "en" }, null)))).toEqual([visible]);
});

test("translation fallback search and display", async () => {
  const id = await publishedRecipe(pool, author.id, { title: "Rice pudding" });
  const { refreshCatalogRow } = await import("../../src/features/recipes/catalog");
  await pool.query(
    "INSERT INTO recipe_translations(recipe_id,language,source_version,status,input) VALUES($1,'es',1,'approved',$2)",
    [id, JSON.stringify({ title: "Arroz con leche", story: "", notes: "", yieldText: "", ingredients: [{ name: "arroz", notes: "", unit: "taza" }], instructions: [{ text: "Cocinar." }], captions: [] })],
  );
  const client = await pool.connect();
  await refreshCatalogRow(client, id).finally(() => client.release());
  const svc = await catalog();
  const es = value(await svc.list({ q: "arroz", language: "es" }, null));
  expect(es.items).toEqual([expect.objectContaining({ id, title: "Arroz con leche", language: "es", translated: true })]);
  const en = value(await svc.list({ q: "arroz", language: "en" }, null));
  expect(en.items).toEqual([expect.objectContaining({ id, title: "Rice pudding", language: "en", translated: false })]);
});

async function drafts() {
  const { createDraftService } = await import("../../src/features/recipes/drafts");
  return createDraftService({ pool, disposeUnusedAsset: async () => {} });
}
async function readyAsset(ownerId: string) {
  const intent = randomUUID(), id = randomUUID();
  await pool.query(
    "INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',1,$3,now(),now())",
    [intent, ownerId, `/${intent}`],
  );
  await pool.query(
    "INSERT INTO media_assets(id,intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,'recipe',$4,$4,100,640,480)",
    [id, intent, ownerId, `/${intent}`],
  );
  return { assetId: id, width: 640, height: 480, caption: "A bowl", alt: "", crop: { x: 50, y: 50, zoom: 1 } };
}
async function publishThroughService(title: string) {
  const { emptyRecipe } = await import("../../src/features/recipes/validation");
  const svc = await drafts();
  const input = {
    ...emptyRecipe(), title, category: "main", origin: "not-sure", yieldText: "4", baseline: 4, baselineConfirmed: true,
    timing: { mode: "total" as const, total: 30, prep: null, cook: null, rest: null },
    photos: [await readyAsset(author.id)],
    ingredients: [{ kind: "ingredient" as const, quantity: "1", unit: "cup", name: "rice", notes: "" }],
    instructions: [{ kind: "step" as const, text: "Cook." }],
  };
  const draft = value(await svc.createDraft(author, input));
  return { svc, input, recipe: value(await svc.publishRecipe(author, draft.id, draft.version)) };
}
const allowSave = (id: string) => pool.query("UPDATE recipes SET last_saved_at=now()-interval '6 seconds' WHERE id=$1", [id]);

test("slug follows title only within 24 hours of first publication", async () => {
  const { nextSlug } = await import("../../src/features/recipes/drafts");
  const t0 = new Date("2026-11-01T00:00:00Z");
  const hours = (h: number) => new Date(t0.getTime() + h * 3_600_000);
  expect(nextSlug("flan", "Flan de coco", t0, hours(23))).toBe("flan-de-coco");
  expect(nextSlug("flan", "Flan de coco", t0, hours(25))).toBe("flan");
  expect(nextSlug(null, "Flan de coco", null, t0)).toBe("flan-de-coco");
});

test("republishing does not restart the slug window", async () => {
  const { svc, input, recipe } = await publishThroughService("Flan");
  await pool.query("UPDATE recipes SET first_published_at=now()-interval '2 days' WHERE id=$1", [recipe.id]);
  const unpublished = value(await svc.unpublishRecipe(author, recipe.id, recipe.version));
  expect(unpublished.state).toBe("unpublished");
  expect((await svc.readPublished(recipe.id)).ok).toBe(false);
  await allowSave(recipe.id);
  const renamed = value(await svc.saveDraft(author, recipe.id, unpublished.version, { ...input, title: "Flan de coco" }));
  const again = value(await svc.publishRecipe(author, recipe.id, renamed.version));
  expect(again.url).toBe(`/recipes/${recipe.id}/flan`);
  const first = (await pool.query("SELECT first_published_at FROM recipes WHERE id=$1", [recipe.id])).rows[0].first_published_at;
  expect(Date.now() - first.getTime()).toBeGreaterThan(36 * 3_600_000);
});

test("title edits move the slug during the first day", async () => {
  const { svc, input, recipe } = await publishThroughService("Flan");
  const unpublished = value(await svc.unpublishRecipe(author, recipe.id, recipe.version));
  await allowSave(recipe.id);
  const renamed = value(await svc.saveDraft(author, recipe.id, unpublished.version, { ...input, title: "Flan de coco" }));
  expect(value(await svc.publishRecipe(author, recipe.id, renamed.version)).url).toBe(`/recipes/${recipe.id}/flan-de-coco`);
});

test("deleted recipes restore within 30 days only", async () => {
  const { svc, recipe } = await publishThroughService("Pozole");
  const deleted = value(await svc.deleteRecipe(author, recipe.id, recipe.version));
  expect(deleted.state).toBe("deleted");
  expect(value(await (await catalog()).list({ language: "en" }, null)).items).toEqual([]);
  expect(value(await svc.listDeleted(author)).map((r) => r.id)).toEqual([recipe.id]);
  expect(value(await svc.restoreRecipe(author, recipe.id)).state).toBe("unpublished");
  const restored = value(await svc.readDraft(author, recipe.id));
  value(await svc.deleteRecipe(author, recipe.id, restored.version));
  await pool.query("UPDATE recipes SET deleted_at=now()-interval '31 days' WHERE id=$1", [recipe.id]);
  expect(await svc.restoreRecipe(author, recipe.id)).toMatchObject({ ok: false, error: { status: 410 } });
  expect(value(await svc.listDeleted(author))).toEqual([]);
});

test("other members cannot change lifecycle", async () => {
  const { svc, recipe } = await publishThroughService("Tamales");
  const other = { ...raters[0], onboarded: true };
  expect(await svc.unpublishRecipe(other, recipe.id, recipe.version)).toMatchObject({ ok: false, error: { status: 404 } });
  expect(await svc.deleteRecipe(other, recipe.id, recipe.version)).toMatchObject({ ok: false, error: { status: 404 } });
  expect(await svc.restoreRecipe(other, recipe.id)).toMatchObject({ ok: false, error: { status: 404 } });
});

test("deleted drafts cannot be restored as recipes", async () => {
  const svc = await drafts();
  const draft = value(await svc.createDraft(author));
  value(await svc.deleteDraft(author, draft.id, draft.version));
  expect(await svc.restoreRecipe(author, draft.id)).toMatchObject({ ok: false, error: { status: 404 } });
});
