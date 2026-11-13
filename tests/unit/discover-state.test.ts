import { expect, test } from "vitest";
import { activeFilterCount, clearFilters, parseDiscoverParams, toDiscoverSearch } from "../../src/features/recipes/discover-state";

const roundTrip = (search: string) => toDiscoverSearch(parseDiscoverParams(new URLSearchParams(search)));

test("discover state round-trips in a stable order", () => {
  expect(roundTrip("sort=rated&category=desserts&q=flan")).toBe("q=flan&category=desserts&sort=rated");
  expect(roundTrip("diet=vegan&time=30&origin=fusion")).toBe("origin=fusion&time=30&diet=vegan");
});

test("defaults are omitted and depend on whether there is a search", () => {
  expect(roundTrip("sort=newest")).toBe("");
  expect(roundTrip("q=flan&sort=relevance")).toBe("q=flan");
  expect(roundTrip("q=flan&sort=newest")).toBe("q=flan&sort=newest");
  expect(roundTrip("sort=relevance")).toBe("");
});

test("unknown or unsafe values are dropped", () => {
  expect(roundTrip("category=snacks&time=45&diet=keto&sort=random&origin=%3Cscript%3E")).toBe("");
  expect(parseDiscoverParams(new URLSearchParams(`q=${"a".repeat(500)}`)).q).toHaveLength(100);
});

test("active filters count category, origin, time and diet only", () => {
  expect(activeFilterCount({})).toBe(0);
  expect(activeFilterCount({ q: "flan", sort: "rated" })).toBe(0);
  expect(activeFilterCount({ category: "desserts", origin: "mexico", maxMinutes: 30, diet: "vegan" })).toBe(4);
});

test("clearing filters keeps the search and a non-default sort", () => {
  expect(clearFilters({ q: "flan", category: "desserts", diet: "vegan", sort: "rated" })).toEqual({ q: "flan", sort: "rated" });
  expect(clearFilters({ category: "main", sort: "newest" })).toEqual({});
});
