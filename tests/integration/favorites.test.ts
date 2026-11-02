import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { migrate } from "../../src/server/db";
import { createAccountService, type Actor } from "../../src/features/accounts/service";
import { publishedRecipe } from "./catalog-fixtures";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `favorites_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
let author: Actor;
let saver: Actor;

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
  saver = await member("saver");
  await pool.query("UPDATE members SET onboarded_at=now(), display_name='Cook'");
  author = { ...author, onboarded: true };
  saver = { ...saver, onboarded: true };
});
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

async function services() {
  const { createFavoriteService } = await import("../../src/features/recipes/favorites");
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  return { favorites: createFavoriteService({ pool }), catalog: createCatalogService({ pool }) };
}
const favoritesOf = async (memberId: string) => {
  const { catalog } = await services();
  const page = await catalog.list({ scope: { kind: "favorites", memberId }, language: "en" }, memberId);
  if (!page.ok) throw new Error(page.error.message);
  return page.value.items;
};

test("guests cannot favorite", async () => {
  const id = await publishedRecipe(pool, author.id);
  const { favorites } = await services();
  expect(await favorites.add(null, id)).toMatchObject({ ok: false, error: { status: 401 } });
});

test("suspended member can favorite", async () => {
  const id = await publishedRecipe(pool, author.id);
  await pool.query("UPDATE members SET suspended=true WHERE id=$1", [saver.id]);
  const { favorites } = await services();
  expect(await favorites.add({ ...saver, suspended: true }, id)).toEqual({ ok: true, value: { favorited: true } });
});

test("favorite is idempotent and counts once", async () => {
  const id = await publishedRecipe(pool, author.id);
  const { favorites, catalog } = await services();
  await favorites.add(saver, id);
  await favorites.add(saver, id);
  const page = await catalog.list({ language: "en" }, saver.id);
  expect(page.ok && page.value.items[0]).toMatchObject({ id, favoriteCount: 1, favorited: true });
  expect(await favorites.remove(saver, id)).toEqual({ ok: true, value: { favorited: false } });
  expect(await favoritesOf(saver.id)).toEqual([]);
});

test("unavailable recipes vanish from favorites but keep the row", async () => {
  const id = await publishedRecipe(pool, author.id, { title: "Secret stew" });
  const { favorites } = await services();
  await favorites.add(saver, id);
  await pool.query("UPDATE recipes SET state='hidden' WHERE id=$1", [id]);
  expect(await favoritesOf(saver.id)).toEqual([]);
  expect((await pool.query("SELECT count(*)::int AS n FROM recipe_favorites")).rows[0].n).toBe(1);
  expect(await favorites.add(saver, id)).toMatchObject({ ok: false, error: { status: 404 } });
  await pool.query("UPDATE recipes SET state='published' WHERE id=$1", [id]);
  expect((await favoritesOf(saver.id)).map((r) => r.id)).toEqual([id]);
});

test("unknown recipe ids are not found", async () => {
  const { favorites } = await services();
  expect(await favorites.add(saver, randomUUID())).toMatchObject({ ok: false, error: { status: 404 } });
  expect(await favorites.add(saver, "not-an-id")).toMatchObject({ ok: false, error: { status: 404 } });
});

test("private saved list is protected", async () => {
  const id = await publishedRecipe(pool, author.id);
  const { favorites, catalog } = await services();
  await favorites.add(saver, id);
  const saved = (viewerId: string | null) =>
    catalog.list({ scope: { kind: "saved", memberId: saver.id, viewerId }, language: "en" }, viewerId);
  expect((await saved(null)).ok).toBe(true);
  await pool.query("UPDATE members SET saved_list_public=false WHERE id=$1", [saver.id]);
  expect(await saved(author.id)).toMatchObject({ ok: false, error: { status: 404 } });
  expect(await saved(null)).toMatchObject({ ok: false, error: { status: 404 } });
  const own = await saved(saver.id);
  expect(own.ok && own.value.items.map((r) => r.id)).toEqual([id]);
});

test("catalog route rejects bad parameters and returns no-store", async () => {
  const { handleCatalogRequest } = await import("../../src/features/recipes/catalog-routes");
  const { catalog } = await services();
  const deps = { catalog, viewer: async () => null };
  const bad = await handleCatalogRequest(new Request("https://recipes.example/api/recipes?cursor=zzz"), deps);
  expect(bad.status).toBe(400);
  const ok = await handleCatalogRequest(new Request("https://recipes.example/api/recipes?q=rice&lang=es"), deps);
  expect(ok.status).toBe(200);
  expect(ok.headers.get("Cache-Control")).toContain("no-store");
  const favorites = await handleCatalogRequest(new Request("https://recipes.example/api/recipes?scope=favorites"), deps);
  expect(favorites.status).toBe(401);
});
