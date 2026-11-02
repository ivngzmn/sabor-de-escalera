import type { CatalogQuery, CatalogSort } from "./catalog";
import { categories } from "./validation";

export type DiscoverParams = Omit<CatalogQuery, "scope" | "cursor" | "language">;
const sorts: CatalogSort[] = ["newest", "rated", "saved", "relevance"];
const times = [30, 60, 120] as const;
const diets = ["vegan", "vegetarian"] as const;

/** A search defaults to relevance; browsing defaults to newest. */
export const defaultSort = (params: { q?: string }): CatalogSort => (params.q ? "relevance" : "newest");

/** Reads shareable Discover state from a URL; unknown values are dropped, never trusted. */
export function parseDiscoverParams(search: URLSearchParams): DiscoverParams {
  const params: DiscoverParams = {};
  const q = search.get("q")?.trim().slice(0, 100);
  if (q) params.q = q;
  const category = search.get("category");
  if (category && categories.some((c) => c.id === category)) params.category = category;
  const origin = search.get("origin");
  if (origin && /^[a-z0-9-]{1,60}$/.test(origin)) params.origin = origin;
  const time = Number(search.get("time"));
  if (times.includes(time as (typeof times)[number])) params.maxMinutes = time as (typeof times)[number];
  const diet = search.get("diet");
  if (diets.includes(diet as (typeof diets)[number])) params.diet = diet as (typeof diets)[number];
  const sort = search.get("sort") as CatalogSort | null;
  if (sort && sorts.includes(sort) && sort !== defaultSort(params) && (sort !== "relevance" || params.q)) params.sort = sort;
  return params;
}

/** Stable query string (q, category, origin, time, diet, sort) with defaults omitted. Never carries user ids. */
export function toDiscoverSearch(params: DiscoverParams): string {
  const out = new URLSearchParams();
  if (params.q) out.set("q", params.q);
  if (params.category) out.set("category", params.category);
  if (params.origin) out.set("origin", params.origin);
  if (params.maxMinutes) out.set("time", String(params.maxMinutes));
  if (params.diet) out.set("diet", params.diet);
  if (params.sort && params.sort !== defaultSort(params)) out.set("sort", params.sort);
  return out.toString();
}
