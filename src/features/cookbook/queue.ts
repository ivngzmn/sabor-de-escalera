import type { Pool, PoolClient } from "pg";
import type { Actor } from "../accounts/service";
import { recordContentAudit } from "../../server/content-audit";
import { getPool, transaction } from "../../server/db";
import { refreshCatalogRow } from "../recipes/catalog";
import { nextSlug } from "../recipes/drafts";
import { isId, validatePublication, type FieldError, type RecipeInput, type Result } from "../recipes/validation";

type TranslationState = "none" | "proposed" | "approved" | "outdated";
export interface QueueRow {
  entryId: string;
  recipeId: string;
  /** Recipe version shown to the reviewer; text review must name it. */
  version: number;
  key: string;
  title: string;
  pages: number[];
  contributor: string | null;
  state: string;
  textReview: "pending" | "approved";
  imageReview: "missing" | "pending" | "approved";
  translation: { en: TranslationState; es: TranslationState };
  missing: string[];
  flags: string[];
  eligible: boolean;
}
export type QueueFilter = "all" | "blocked" | "eligible";

class QueueError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: FieldError[]) {
    super(message);
  }
}
async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return e instanceof QueueError
      ? { ok: false, error: { status: e.status, message: e.message, fields: e.fields } }
      : { ok: false, error: { status: 503, message: "The cookbook queue is unavailable. Please retry." } };
  }
}
interface EntryRow {
  id: string;
  recipe_id: string;
  import_key: string;
  book_pages: number[];
  contributor: string | null;
  flags: string[];
  text_review: "pending" | "approved";
  image_review: "missing" | "pending" | "approved";
  state: string;
  version: number;
  input: RecipeInput;
  translations: { language: "en" | "es"; status: string }[];
}

/** Publication blockers: spec-required fields, both reviews, and a recorded credit for every ready photo. */
async function blockers(client: PoolClient | Pool, row: EntryRow): Promise<string[]> {
  const missing = [...new Set(validatePublication(row.input).map((f) => f.field.split(".")[0]))];
  if (row.text_review !== "approved") missing.push("text-review");
  if (row.image_review !== "approved") missing.push("image-review");
  if (missing.length) return missing;
  const ids = row.input.photos.map((p) => p.assetId);
  const credited = (
    await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM media_assets a JOIN photo_credits c ON c.asset_id=a.id WHERE a.id=ANY($1::uuid[]) AND a.state='ready' AND a.purpose='recipe'",
      [ids],
    )
  ).rows[0].n;
  return credited === new Set(ids).size ? [] : ["photo-credit"];
}
function translation(rows: EntryRow["translations"], language: "en" | "es"): TranslationState {
  const mine = rows.filter((t) => t.language === language).map((t) => t.status);
  return mine.includes("approved") ? "approved" : mine.includes("proposed") ? "proposed" : mine.includes("outdated") ? "outdated" : "none";
}
const SELECT = `SELECT e.id,e.recipe_id,e.import_key,e.book_pages,e.contributor,e.flags,e.text_review,e.image_review,r.state,r.version,r.input,
  COALESCE((SELECT json_agg(json_build_object('language',t.language,'status',t.status)) FROM recipe_translations t WHERE t.recipe_id=r.id),'[]') AS translations
  FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id`;

export function createCookbookQueue({ pool }: { pool: Pool }) {
  async function requireAdmin(client: PoolClient | Pool, actor: Actor | null) {
    if (!actor || !isId(actor.id)) throw new QueueError(401, "Sign-in required.");
    const row = (await client.query("SELECT role FROM members WHERE id=$1 AND onboarded_at IS NOT NULL AND NOT suspended", [actor.id])).rows[0];
    if (!row || !["admin", "owner"].includes(row.role)) throw new QueueError(403, "Admin access required.");
  }
  async function entry(client: PoolClient, id: string) {
    if (!isId(id)) throw new QueueError(404, "Entry not found.");
    await client.query("SELECT 1 FROM cookbook_entries WHERE id=$1 FOR UPDATE", [id]);
    const row = (await client.query<EntryRow>(`${SELECT} WHERE e.id=$1`, [id])).rows[0];
    if (!row) throw new QueueError(404, "Entry not found.");
    return row;
  }
  return {
    listQueue: (actor: Actor | null, filter: QueueFilter) =>
      result(async () => {
        await requireAdmin(pool, actor);
        const rows = (await pool.query<EntryRow>(`${SELECT} ORDER BY e.book_pages[1],e.import_key`)).rows;
        const out: QueueRow[] = [];
        for (const r of rows) {
          const missing = r.state === "published" ? [] : await blockers(pool, r);
          const eligible = r.state === "draft" && missing.length === 0;
          if ((filter === "eligible" && !eligible) || (filter === "blocked" && (eligible || r.state === "published"))) continue;
          out.push({
            entryId: r.id,
            recipeId: r.recipe_id,
            version: r.version,
            key: r.import_key,
            title: r.input.title || "Untitled recipe",
            pages: r.book_pages,
            contributor: r.contributor,
            state: r.state,
            textReview: r.text_review,
            imageReview: r.image_review,
            translation: { en: translation(r.translations, "en"), es: translation(r.translations, "es") },
            missing,
            flags: r.flags,
            eligible,
          });
        }
        return out;
      }),
    /** Approves the text the reviewer actually saw; a re-import since then is a 409. */
    markTextReviewed: (actor: Actor | null, entryId: string, expectedVersion: number) =>
      result(() =>
        transaction(pool, async (client) => {
          await requireAdmin(client, actor);
          const row = await entry(client, entryId);
          await client.query("SELECT 1 FROM recipes WHERE id=$1 FOR UPDATE", [row.recipe_id]);
          const current = (await client.query<{ version: number }>("SELECT version FROM recipes WHERE id=$1", [row.recipe_id])).rows[0].version;
          if (!Number.isSafeInteger(expectedVersion) || current !== expectedVersion)
            throw new QueueError(409, "This recipe changed since you opened it. Reload and review it again.");
          await client.query("UPDATE cookbook_entries SET text_review='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1", [entryId, actor!.id]);
          await recordContentAudit(client, actor!.id, "cookbook_text_reviewed", entryId, { version: current });
          return { textReview: "approved" as const };
        }),
      ),
    /** Publishes an ownerless cookbook recipe once nothing blocks it; historical credit stays on the entry. */
    publishImported: (actor: Actor | null, entryId: string) =>
      result(() =>
        transaction(pool, async (client) => {
          await requireAdmin(client, actor);
          const row = await entry(client, entryId);
          if (row.state !== "draft") throw new QueueError(409, "This recipe is already published or unavailable.");
          const missing = await blockers(client, row);
          if (missing.length)
            throw new QueueError(409, "This recipe isn't ready to publish.", missing.map((field) => ({ field, step: 0, message: field })));
          for (const p of row.input.photos)
            await client.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2) ON CONFLICT DO NOTHING", [p.assetId, row.recipe_id]);
          const published = (
            await client.query<{ id: string; slug: string }>(
              "UPDATE recipes SET state='published',slug=$2,first_published_at=now(),version=version+1,updated_at=now() WHERE id=$1 RETURNING id,slug",
              [row.recipe_id, nextSlug(null, row.input.title, null, new Date())],
            )
          ).rows[0];
          await refreshCatalogRow(client, row.recipe_id);
          await recordContentAudit(client, actor!.id, "cookbook_published", entryId, { recipeId: row.recipe_id });
          return { id: published.id, url: `/recipes/${published.id}/${published.slug}` };
        }),
      ),
  };
}

export const cookbookQueue = () => createCookbookQueue({ pool: getPool() });
