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
