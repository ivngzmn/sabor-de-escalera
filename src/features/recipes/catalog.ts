import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { getPool } from "../../server/db";
import { searchKey } from "./search-key";
import {
  categories,
  isId,
  totalMinutes,
  type RecipeInput,
  type Result,
} from "./validation";

export type CatalogSort = "newest" | "rated" | "saved" | "relevance";
export type CatalogScope =
  | { kind: "favorites"; memberId: string }
  | { kind: "author"; memberId: string }
  | { kind: "saved"; memberId: string; viewerId: string | null };
export interface CatalogQuery {
  q?: string;
  category?: string;
  origin?: string;
  maxMinutes?: 30 | 60 | 120;
  diet?: "vegan" | "vegetarian";
  sort?: CatalogSort;
  cursor?: string;
  language: "en" | "es";
  scope?: CatalogScope;
}
export interface RecipeCard {
  id: string;
  url: string;
  title: string;
  language: "en" | "es";
  translated: boolean;
  authorName: string | null;
  authorId: string | null;
  origin: string | null;
  totalMinutes: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  favoriteCount: number;
  favorited: boolean;
  cover: { assetId: string; alt: string; width?: number; height?: number } | null;
}
export interface CatalogPage {
  items: RecipeCard[];
  nextCursor: string | null;
}
export const PAGE_SIZE = 12;
export const MAX_QUERY = 100;
export const RATING_THRESHOLD = 3;

interface TranslationText {
  title: string;
  ingredients?: { name: string }[];
}

/** Recomputes the denormalized catalog columns. Call inside the transaction that changes a recipe or its approved translations. */
export async function refreshCatalogRow(client: PoolClient, recipeId: string) {
  const r = (
    await client.query<{ input: RecipeInput }>("SELECT input FROM recipes WHERE id=$1", [recipeId])
  ).rows[0];
  if (!r) return;
  const translations = (
    await client.query<{ input: TranslationText }>(
      "SELECT input FROM recipe_translations WHERE recipe_id=$1 AND status='approved'",
      [recipeId],
    )
  ).rows.map((t) => t.input);
  const input = r.input;
  const titles = [input.title, ...translations.map((t) => t.title)];
  const text = [
    ...titles,
    ...input.ingredients.filter((i) => i.kind === "ingredient").map((i) => i.name),
    ...translations.flatMap((t) => (t.ingredients ?? []).map((i) => i.name)),
  ];
  await client.query(
    "UPDATE recipes SET search_text=$2,title_keys=$3,category=$4,origin=$5,total_minutes=$6,dietary=$7,language=$8 WHERE id=$1",
    [
      recipeId,
      text.map(searchKey).join("\n"),
      [...new Set(titles.map(searchKey).filter(Boolean))],
      input.category || null,
      input.origin || null,
      totalMinutes(input),
      input.dietary,
      input.language === "es" ? "es" : "en",
    ],
  );
}

const cursorSchema = z.object({
  s: z.enum(["newest", "rated", "saved", "relevance"]),
  k: z.number().finite(),
  t: z.string().regex(/^-?\d{1,20}$/),
  id: z.string().refine(isId),
});
type Cursor = z.infer<typeof cursorSchema>;
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decode(value: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const fail = (status: number, message: string): Result<never> => ({ ok: false, error: { status, message } });

interface Row {
  id: string;
  slug: string;
  input: RecipeInput;
  language: "en" | "es";
  translation: TranslationText | null;
  author_id: string | null;
  author_name: string | null;
  origin: string | null;
  total_minutes: number | null;
  rating_avg: number | null;
  rating_count: number;
  favorite_count: number;
  favorited: boolean;
  k: number;
  t: string;
}

export function createCatalogService({ pool }: { pool: Pool }) {
  return {
    async list(query: CatalogQuery, viewerId: string | null): Promise<Result<CatalogPage>> {
      const q = searchKey((query.q ?? "").slice(0, MAX_QUERY * 4)).slice(0, MAX_QUERY);
      const sort: CatalogSort = query.sort ?? (q ? "relevance" : "newest");
      if (sort === "relevance" && !q) return fail(400, "Relevance sorting needs a search.");
      if (query.category && !categories.some((c) => c.id === query.category)) return fail(400, "Unknown category.");
      if (query.maxMinutes && ![30, 60, 120].includes(query.maxMinutes)) return fail(400, "Unknown time filter.");
      if (query.diet && !["vegan", "vegetarian"].includes(query.diet)) return fail(400, "Unknown dietary filter.");
      if (viewerId !== null && !isId(viewerId)) return fail(400, "Invalid viewer.");
      let cursor: Cursor | null = null;
      if (query.cursor !== undefined) {
        cursor = decode(query.cursor);
        if (!cursor || cursor.s !== sort) return fail(400, "This list changed. Start again from the top.");
      }
      const params: unknown[] = [];
      const p = (value: unknown) => `$${params.push(value)}`;
      const where = ["r.state='published'"];
      const scope = query.scope;
      if (scope) {
        if (!isId(scope.memberId)) return fail(404, "Profile unavailable.");
        if (scope.kind === "author") where.push(`r.owner_id=${p(scope.memberId)}`);
        else {
          if (scope.kind === "saved" && scope.viewerId !== scope.memberId) {
            const member = (
              await pool.query("SELECT saved_list_public FROM members WHERE id=$1", [scope.memberId])
            ).rows[0];
            if (!member?.saved_list_public) return fail(404, "This saved list is private.");
          }
          where.push(`EXISTS (SELECT 1 FROM recipe_favorites f WHERE f.recipe_id=r.id AND f.member_id=${p(scope.memberId)})`);
        }
      }
      if (q) where.push(`r.search_text LIKE ${p(`%${likeEscape(q)}%`)} ESCAPE '\\'`);
      if (query.category) where.push(`r.category=${p(query.category)}`);
      if (query.origin) where.push(`r.origin=${p(query.origin)}`);
      if (query.maxMinutes) where.push(`r.total_minutes<=${p(query.maxMinutes)}`);
      if (query.diet) where.push(`${p(query.diet)}=ANY(r.dietary)`);
      const k =
        sort === "saved"
          ? "favorite_count::float8"
          : sort === "rated"
            ? `CASE WHEN rating_count>=${RATING_THRESHOLD} THEN rating_avg ELSE -1 END`
            : sort === "relevance"
              ? `(${p(q)}=ANY(title_keys))::int::float8`
              : "0::float8";
      const language = p(query.language);
      const viewer = p(viewerId);
      const after = cursor ? `WHERE (k,t,id) < (${p(cursor.k)}::float8,${p(cursor.t)}::bigint,${p(cursor.id)}::uuid)` : "";
      const rows = (
        await pool.query<Row & { t: string }>(
          `SELECT * FROM (
             SELECT r.id,r.slug,r.input,r.language,r.title_keys,r.origin,r.total_minutes,r.first_published_at,
               m.id AS author_id,m.display_name AS author_name,
               (SELECT tr.input FROM recipe_translations tr WHERE tr.recipe_id=r.id AND tr.status='approved' AND tr.language=${language} AND r.language<>${language}) AS translation,
               rt.rating_avg,rt.rating_count,fv.favorite_count,
               (${viewer}::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM recipe_favorites f WHERE f.recipe_id=r.id AND f.member_id=${viewer}::uuid)) AS favorited,
               (extract(epoch FROM r.first_published_at)*1000000)::bigint AS t
             FROM recipes r
             LEFT JOIN members m ON m.id=r.owner_id
             CROSS JOIN LATERAL (SELECT avg(stars)::float8 AS rating_avg,count(*)::int AS rating_count FROM recipe_ratings WHERE recipe_id=r.id) rt
             CROSS JOIN LATERAL (SELECT count(*)::int AS favorite_count FROM recipe_favorites WHERE recipe_id=r.id) fv
             WHERE ${where.join(" AND ")}
           ) base
           CROSS JOIN LATERAL (SELECT ${k} AS k) sortkey
           ${after}
           ORDER BY k DESC,t DESC,id DESC
           LIMIT ${PAGE_SIZE + 1}`,
          params,
        )
      ).rows;
      const more = rows.length > PAGE_SIZE;
      const page = rows.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      return {
        ok: true,
        value: {
          items: page.map((r) => card(r, query.language)),
          nextCursor: more && last ? encode({ s: sort, k: Number(last.k), t: String(last.t), id: last.id }) : null,
        },
      };
    },
  };
}

function card(r: Row, requested: "en" | "es"): RecipeCard {
  const cover = r.input.photos[0];
  return {
    id: r.id,
    url: `/recipes/${r.id}/${r.slug}`,
    title: r.translation?.title || r.input.title || "Untitled recipe",
    language: r.translation ? requested : r.language,
    translated: Boolean(r.translation),
    authorName: r.author_name,
    authorId: r.author_id,
    origin: r.origin,
    totalMinutes: r.total_minutes,
    ratingAverage: r.rating_count ? Math.round(r.rating_avg! * 10) / 10 : null,
    ratingCount: r.rating_count,
    favoriteCount: r.favorite_count,
    favorited: r.favorited,
    cover: cover
      ? { assetId: cover.assetId, alt: cover.alt || cover.caption, width: cover.width, height: cover.height }
      : null,
  };
}

export const catalogService = () => createCatalogService({ pool: getPool() });
