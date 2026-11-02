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
