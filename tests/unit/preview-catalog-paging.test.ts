import { expect, test } from "vitest";
import { PAGE_SIZE } from "../../src/features/recipes/catalog";
import { getPreviewState, previewCatalogService } from "../../src/server/preview-store";

test("the preview catalog pages like the database catalog", async () => {
  const state = getPreviewState();
  const published = [...state.recipes.values()].filter((r) => r.state === "published");
  const seed = published[0];
  for (let n = 0; n < PAGE_SIZE * 2; n++) {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    state.recipes.set(id, { ...seed, id, firstPublishedAt: new Date(Date.UTC(2020, 0, 1) - n * 1000).toISOString() });
  }
  const total = published.length + PAGE_SIZE * 2;

  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await previewCatalogService.list({ language: "en", cursor }, null);
    if (!page.ok) throw new Error(page.error.message);
    expect(page.value.items.length).toBeLessThanOrEqual(PAGE_SIZE);
    seen.push(...page.value.items.map((c) => c.id));
    cursor = page.value.nextCursor ?? undefined;
    pages++;
  } while (cursor);

  expect(seen).toHaveLength(total);
  expect(new Set(seen).size).toBe(total);
  expect(pages).toBe(Math.ceil(total / PAGE_SIZE));
});

test("a cursor from another sort or an unknown recipe starts over with an error", async () => {
  const first = await previewCatalogService.list({ language: "en" }, null);
  if (!first.ok || !first.value.nextCursor) throw new Error("expected a second page");
  const other = await previewCatalogService.list({ language: "en", sort: "saved", cursor: first.value.nextCursor }, null);
  expect(other.ok).toBe(false);
  const unknown = await previewCatalogService.list({ language: "en", cursor: "newest:missing" }, null);
  expect(unknown.ok).toBe(false);
});
