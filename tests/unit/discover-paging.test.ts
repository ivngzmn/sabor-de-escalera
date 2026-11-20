import { describe, expect, test } from "vitest";
import type { RecipeCard } from "../../src/features/recipes/catalog";
import { appendPage, photoLoading, photoSources, shouldAutoLoad } from "../../src/features/recipes/discover-paging";

const card = (id: string, cover = true) =>
  ({ id, cover: cover ? { assetId: `a-${id}`, alt: "" } : null }) as unknown as RecipeCard;

describe("appendPage", () => {
  test("adds the next page after the cards already shown", () => {
    expect(appendPage([card("1"), card("2")], [card("3"), card("4")]).map((c) => c.id)).toEqual(["1", "2", "3", "4"]);
  });

  test("drops cards already on screen and repeats within the page", () => {
    expect(appendPage([card("1"), card("2")], [card("2"), card("3"), card("3")]).map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  test("keeps the same array when nothing is new, so React skips a render", () => {
    const current = [card("1")];
    expect(appendPage(current, [card("1")])).toBe(current);
    expect(appendPage(current, [])).toBe(current);
  });
});

describe("shouldAutoLoad", () => {
  test("waits for the reader to scroll before fetching another page", () => {
    expect(shouldAutoLoad({ cursor: "next", status: "idle", scrolled: false })).toBe(false);
    expect(shouldAutoLoad({ cursor: "next", status: "idle", scrolled: true })).toBe(true);
  });

  test("never fetches past the last page, during a request or after an error", () => {
    expect(shouldAutoLoad({ cursor: null, status: "idle", scrolled: true })).toBe(false);
    expect(shouldAutoLoad({ cursor: "next", status: "loading", scrolled: true })).toBe(false);
    expect(shouldAutoLoad({ cursor: "next", status: "error", scrolled: true })).toBe(false);
  });
});

describe("photoLoading", () => {
  test("only the featured card loads eagerly when shelves show", () => {
    expect([0, 1, 2, 3].map((i) => photoLoading(i, { shelves: true }))).toEqual(["eager", "deferred", "deferred", "deferred"]);
  });

  test("the first grid row loads eagerly in a filtered list", () => {
    expect([0, 1, 2, 3, 11].map((i) => photoLoading(i, { shelves: false }))).toEqual(["eager", "eager", "eager", "deferred", "deferred"]);
  });

  test("cards appended by later pages are deferred", () => {
    expect(photoLoading(12, { shelves: false })).toBe("deferred");
  });
});

describe("photoSources", () => {
  test("a grid card offers the 320 and 640 variants and never the gallery size", () => {
    const sources = photoSources(card("r1"))!;
    expect(sources.src).toBe("/api/recipes/r1/photos/a-r1?variant=card");
    expect(sources.srcSet).toBe("/api/recipes/r1/photos/a-r1?variant=thumb 320w, /api/recipes/r1/photos/a-r1?variant=card 640w");
    expect(sources.srcSet).not.toContain("gallery");
    expect(sources.sizes).toMatch(/100vw$/);
  });

  test("the featured card can drop to the card variant on small or 1x screens", () => {
    const sources = photoSources(card("r1"), true)!;
    expect(sources.src).toContain("variant=gallery");
    expect(sources.srcSet).toContain("variant=card 640w");
    expect(sources.srcSet).toContain("variant=gallery 1600w");
  });

  test("a card without a cover has no sources", () => {
    expect(photoSources(card("r1", false))).toBeNull();
  });
});
