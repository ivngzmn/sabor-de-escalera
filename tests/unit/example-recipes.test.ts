import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { exampleEntries, type ExampleFile } from "../../scripts/example-entries";
import { parseManifest, stagedInput } from "../../src/features/cookbook/manifest";
import { validatePublication } from "../../src/features/recipes/validation";

const data = JSON.parse(readFileSync("scripts/example-recipes.json", "utf8")) as ExampleFile;

test("ten examples parse as a manifest and meet the publication rules once photos are attached", () => {
  const parsed = parseManifest(exampleEntries(data));
  if (!parsed.ok) throw new Error(parsed.error.message);
  expect(parsed.value).toHaveLength(10);
  for (const [index, entry] of parsed.value.entries()) {
    expect(entry.key).toMatch(/^example-/);
    const photos = data.recipes[index].photos.map(([, caption]) => ({ assetId: "11111111-1111-4111-8111-111111111111", width: 640, height: 480, caption, alt: "", crop: { x: 50, y: 50, zoom: 1 } }));
    const unique = photos.map((p, n) => ({ ...p, assetId: `11111111-1111-4111-8111-11111111111${n}` }));
    expect(validatePublication({ ...stagedInput(entry), baselineConfirmed: true, photos: unique })).toEqual([]);
  }
});

test("every example uses an origin the seed adds", () => {
  const origins = new Set(data.origins.map(([id]) => id));
  expect(data.recipes.every((r) => origins.has(r.origin))).toBe(true);
});
