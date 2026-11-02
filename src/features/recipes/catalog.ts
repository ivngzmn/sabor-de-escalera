import type { Pool, PoolClient } from "pg";
import { z } from "zod";
// .ts specifiers let scripts/migrate.ts run the backfill under Node type stripping, like server/db.ts.
import { getPool, transaction } from "../../server/db.ts";
import { searchKey } from "./search-key.ts";
import type { TranslatableText } from "./translation-text";
import {
  categories,
  isId,
  totalMinutes,
  type RecipeInput,
  type Result,
} from "./validation.ts";

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

/** Fills catalog columns for live, unpublished or deleted recipes that predate 0005_discovery. Idempotent. */
export async function backfillCatalog(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM recipes WHERE state<>'draft' AND search_text='' ORDER BY id",
  );
  for (const { id } of rows) await transaction(pool, (client) => refreshCatalogRow(client, id));
  return rows.length;
}

const cursorSchema = z.object({
  s: z.enum(["newest", "rated", "saved", "relevance"]),
  k: z.number(),
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

export interface PublicMember {
  id: string;
  displayName: string;
  bio: string;
  avatarAssetId: string | null;
  avatarPreset: "chile" | "corn" | "lime" | null;
  savedListPublic: boolean;
  memberSince: string;
}

export function createCatalogService({ pool }: { pool: Pool }) {
  return {
    /** Approved translation for readers; outdated or proposed text is never shown. */
    async readerTranslation(recipeId: string, language: "en" | "es"): Promise<TranslatableText | null> {
      if (!isId(recipeId)) return null;
      return (
        (
          await pool.query<{ input: TranslatableText }>(
            "SELECT tr.input FROM recipe_translations tr JOIN recipes r ON r.id=tr.recipe_id WHERE tr.recipe_id=$1 AND tr.language=$2 AND tr.status='approved' AND r.language<>$2",
            [recipeId, language],
          )
        ).rows[0]?.input ?? null
      );
    },
    /** Historical cookbook credit, kept apart from the owning account. Null for member recipes. */
    async cookbookCredit(recipeId: string): Promise<{ contributor: string | null; originalAuthor: string | null } | null> {
      if (!isId(recipeId)) return null;
      const row = (
        await pool.query("SELECT contributor,original_author FROM cookbook_entries WHERE recipe_id=$1", [recipeId])
      ).rows[0];
      return row ? { contributor: row.contributor, originalAuthor: row.original_author } : null;
    },
    /** Display name for a recipe's author, or null for ownerless cookbook recipes. */
    async authorName(memberId: string | null): Promise<string | null> {
      if (!memberId || !isId(memberId)) return null;
      return (await pool.query("SELECT display_name FROM members WHERE id=$1 AND onboarded_at IS NOT NULL", [memberId])).rows[0]?.display_name ?? null;
    },
    /** Saved recipes that are currently visible; hidden ones keep their row but are not counted. */
    async countFavorites(memberId: string): Promise<number> {
      if (!isId(memberId)) return 0;
      return (
        await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM recipe_favorites f JOIN recipes r ON r.id=f.recipe_id AND r.state='published' WHERE f.member_id=$1",
          [memberId],
        )
      ).rows[0].n;
    },
    /** Public profile fields only; email and role never leave this query. */
    async member(id: string): Promise<PublicMember | null> {
      if (!isId(id)) return null;
      const m = (
        await pool.query(
          "SELECT id,display_name,bio,avatar_asset_id,avatar_preset,saved_list_public,created_at FROM members WHERE id=$1 AND onboarded_at IS NOT NULL",
          [id],
        )
      ).rows[0];
      return m
        ? {
            id: m.id,
            displayName: m.display_name,
            bio: m.bio,
            avatarAssetId: m.avatar_asset_id,
            avatarPreset: m.avatar_preset,
            savedListPublic: m.saved_list_public,
            memberSince: m.created_at.toISOString(),
          }
        : null;
    },
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
