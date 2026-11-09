import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Actor } from "../accounts/service";
import { recordContentAudit } from "../../server/content-audit";
import { getPool, transaction } from "../../server/db";
import { disposeUnusedAsset } from "../media/service";
import { refreshCatalogRow } from "../recipes/catalog";
import { validateDraft, type RecipeInput } from "../recipes/validation";
import { lockEntry, needsSourceClearance, QueueError, requireAdmin, result, type EntryRow } from "./queue";

type ImageReview = EntryRow["image_review"];
type TextReview = EntryRow["text_review"];

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).optional();
const pastDate = z.iso.date().refine((d) => d <= new Date().toISOString().slice(0, 10), "Use a date that has already happened.");
// Spec 16: stock photos come only from individually verified Pexels or Unsplash pages.
const stockPage = z.url({ protocol: /^https$/ }).refine((u) => /^(www\.)?(unsplash|pexels)\.com$/.test(new URL(u).hostname), "Link the photo's Unsplash or Pexels page.");
const creditSchema = z.discriminatedUnion("kind", [
  // license records how the owner gave permission; attribution alone is not permission.
  z.strictObject({ kind: z.literal("owner"), photographer: text(120), license: text(200), retrievedOn: pastDate.optional(), cropping: optional(200) }),
  z.strictObject({ kind: z.literal("stock"), photographer: text(120), sourceUrl: stockPage, license: text(200), retrievedOn: pastDate, cropping: optional(200) }),
  // license names the generator and the terms the owner approved.
  z.strictObject({ kind: z.literal("ai"), license: text(200), cropping: optional(200) }),
]);
export type PhotoCreditInput = z.infer<typeof creditSchema>;
const labels = { owner: "none", stock: "illustrative", ai: "ai-illustrative" } as const;

/** Corrections fix wording and fill gaps; the book's rows stay in the same number, order and kind. */
function sameRows(before: RecipeInput, after: RecipeInput) {
  const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind).join();
  return (
    before.language === after.language &&
    kinds(before.ingredients) === kinds(after.ingredients) &&
    kinds(before.instructions) === kinds(after.instructions)
  );
}
const changedFields = (before: RecipeInput, after: RecipeInput) =>
  (Object.keys(after) as (keyof RecipeInput)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();

export function createCookbookCorrections({ pool, dispose = async () => {} }: { pool: Pool; dispose?: (assetId: string) => Promise<void> }) {
  /** Locks the entry and its recipe, then checks it is still an unpublished draft at the version the admin saw. */
  async function editable(client: PoolClient, actor: Actor | null, entryId: string, version: number) {
    await requireAdmin(client, actor);
    const row = await lockEntry(client, entryId);
    await client.query("SELECT 1 FROM recipes WHERE id=$1 FOR UPDATE", [row.recipe_id]);
    const current = (await client.query<{ version: number; state: string }>("SELECT version,state FROM recipes WHERE id=$1", [row.recipe_id])).rows[0];
    if (current.state !== "draft") throw new QueueError(409, "Only unpublished cookbook entries can be changed here.");
    if (!Number.isSafeInteger(version) || current.version !== version)
      throw new QueueError(409, "This recipe changed since you opened it. Reload and try again.");
    return row;
  }
  /** Keeps photos the entry already had; new ones must be this admin's own ready recipe uploads. */
  async function attachPhotos(client: PoolClient, actor: Actor, row: EntryRow, input: RecipeInput) {
    const before = new Set(row.input.photos.map((p) => p.assetId));
    for (const assetId of [...new Set(input.photos.map((p) => p.assetId))].sort()) {
      const a = (await client.query("SELECT owner_id,purpose,state,width,height FROM media_assets WHERE id=$1 FOR UPDATE", [assetId])).rows[0];
      if (!a || a.purpose !== "recipe" || a.state !== "ready" || (!before.has(assetId) && a.owner_id !== actor.id))
        throw new QueueError(403, "Use your own verified, available recipe photos.");
      for (const photo of input.photos.filter((p) => p.assetId === assetId)) Object.assign(photo, { width: a.width, height: a.height });
    }
    await client.query("DELETE FROM media_references WHERE kind='recipe' AND reference_id=$1", [row.recipe_id]);
    for (const p of input.photos)
      await client.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2) ON CONFLICT DO NOTHING", [p.assetId, row.recipe_id]);
    return [...before].filter((id) => !input.photos.some((p) => p.assetId === id));
  }

  return {
    /** Saves an admin's correction with a reason. Changed text needs review again; changed photos need image review again. */
    correctEntry: (actor: Actor | null, entryId: string, change: { version: number; input: unknown; reason: unknown }) =>
      result(async () => {
        const outcome = await transaction(pool, async (client) => {
          const row = await editable(client, actor, entryId, change.version);
          const reason = typeof change.reason === "string" ? change.reason.trim() : "";
          if (!reason || reason.length > 400)
            throw new QueueError(422, "Say why you made this correction (up to 400 characters).", [{ field: "reason", step: 0, message: "Add a reason." }]);
          const fields = validateDraft(change.input);
          if (fields.length) throw new QueueError(422, "Check the highlighted fields.", fields);
          const input = structuredClone(change.input) as RecipeInput;
          if (input.origin && !(await client.query("SELECT 1 FROM recipe_origins WHERE id=$1 AND active", [input.origin])).rowCount)
            throw new QueueError(422, "Choose an available origin.", [{ field: "origin", step: 0, message: "Choose an available origin." }]);
          if (!sameRows(row.input, input))
            throw new QueueError(422, "Corrections can fix wording but can't add, remove or change the kind of ingredient or step rows.");
          const removed = await attachPhotos(client, actor!, row, input);
          const changed = changedFields(row.input, input);
          if (!changed.length) throw new QueueError(422, "There are no changes to save.");
          const textReview: TextReview = changed.some((k) => k !== "photos") ? "pending" : row.text_review;
          const imageReview: ImageReview = changed.includes("photos") ? (input.photos.length ? "pending" : "missing") : row.image_review;
          const version = (
            await client.query<{ version: number }>("UPDATE recipes SET input=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING version", [row.recipe_id, JSON.stringify(input)])
          ).rows[0].version;
          await client.query("UPDATE cookbook_entries SET text_review=$2,image_review=$3 WHERE id=$1", [entryId, textReview, imageReview]);
          // Approved translations (captions included) describe the old text; readers fall back to the original.
          const outdated = await client.query("UPDATE recipe_translations SET status='outdated',updated_at=now() WHERE recipe_id=$1 AND status='approved'", [row.recipe_id]);
          if (outdated.rowCount) await refreshCatalogRow(client, row.recipe_id);
          await recordContentAudit(client, actor!.id, "cookbook_corrected", entryId, { version, reason, fields: changed.join(",") });
          return { value: { version, textReview, imageReview }, removed };
        });
        for (const id of outcome.removed) await dispose(id).catch(() => undefined);
        return outcome.value;
      }),
    /** Records where a photo came from and under what permission. Any change reopens image review. */
    recordPhotoCredit: (actor: Actor | null, entryId: string, change: { version: number; assetId: string; credit: unknown }) =>
      result(() =>
        transaction(pool, async (client) => {
          const row = await editable(client, actor, entryId, change.version);
          if (!row.input.photos.some((p) => p.assetId === change.assetId)) throw new QueueError(404, "That photo isn't on this recipe.");
          const parsed = creditSchema.safeParse(change.credit);
          if (!parsed.success)
            throw new QueueError(422, "Check the photo credit.", parsed.error.issues.map((i) => ({ field: `credit.${i.path.join(".") || "kind"}`, step: 1, message: i.message })));
          const c = parsed.data;
          await client.query(
            `INSERT INTO photo_credits(asset_id,kind,photographer,source_url,license,retrieved_on,cropping,label,recorded_by,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
             ON CONFLICT (asset_id) DO UPDATE SET kind=EXCLUDED.kind,photographer=EXCLUDED.photographer,source_url=EXCLUDED.source_url,license=EXCLUDED.license,
             retrieved_on=EXCLUDED.retrieved_on,cropping=EXCLUDED.cropping,label=EXCLUDED.label,recorded_by=EXCLUDED.recorded_by,recorded_at=now()`,
            [change.assetId, c.kind, "photographer" in c ? c.photographer : null, "sourceUrl" in c ? c.sourceUrl : null, c.license, "retrievedOn" in c ? (c.retrievedOn ?? null) : null, c.cropping || null, labels[c.kind], actor!.id],
          );
          const imageReview: ImageReview = row.image_review === "approved" ? "pending" : row.image_review;
          await client.query("UPDATE cookbook_entries SET image_review=$2 WHERE id=$1", [entryId, imageReview]);
          await recordContentAudit(client, actor!.id, "photo_credit_recorded", entryId, { assetId: change.assetId, kind: c.kind });
          return { imageReview };
        }),
      ),
    /** Approves the photos the admin saw, once every one of them has a recorded credit. */
    markImagesReviewed: (actor: Actor | null, entryId: string, version: number) =>
      result(() =>
        transaction(pool, async (client) => {
          const row = await editable(client, actor, entryId, version);
          const ids = [...new Set(row.input.photos.map((p) => p.assetId))];
          if (!ids.length) throw new QueueError(409, "Add at least one photo first.");
          const credited = (
            await client.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM media_assets a JOIN photo_credits c ON c.asset_id=a.id WHERE a.id=ANY($1::uuid[]) AND a.state='ready' AND a.purpose='recipe'",
              [ids],
            )
          ).rows[0].n;
          if (credited !== ids.length) throw new QueueError(409, "Record a credit for every photo first.");
          await client.query("UPDATE cookbook_entries SET image_review='approved' WHERE id=$1", [entryId]);
          await recordContentAudit(client, actor!.id, "cookbook_images_reviewed", entryId, { version });
          return { imageReview: "approved" as const };
        }),
      ),
    /** Records how reuse of an outside source was cleared. A written note, not a tick box: spec 16 asks to track these issues. */
    clearSource: (actor: Actor | null, entryId: string, change: { version: number; note: unknown }) =>
      result(() =>
        transaction(pool, async (client) => {
          const row = await editable(client, actor, entryId, change.version);
          if (!needsSourceClearance(row.flags)) throw new QueueError(409, "This recipe has no outside source to clear.");
          const note = typeof change.note === "string" ? change.note.trim() : "";
          if (!note || note.length > 400)
            throw new QueueError(422, "Say how reuse was cleared (up to 400 characters).", [{ field: "note", step: 0, message: "Add a note." }]);
          await client.query("UPDATE cookbook_entries SET source_clearance=$2,source_cleared_by=$3,source_cleared_at=now() WHERE id=$1", [entryId, note, actor!.id]);
          await recordContentAudit(client, actor!.id, "cookbook_source_cleared", entryId, { version: change.version, note });
          return { sourceClearance: "cleared" as const };
        }),
      ),
    /** Credits recorded for this entry's photos, for the admin review page. */
    credits: (actor: Actor | null, entryId: string) =>
      result(async () => {
        await requireAdmin(pool, actor);
        const rows = (
          await pool.query(
            `SELECT c.asset_id,c.kind,c.photographer,c.source_url,c.license,to_char(c.retrieved_on,'YYYY-MM-DD') AS retrieved_on,c.cropping FROM cookbook_entries e
             JOIN recipes r ON r.id=e.recipe_id JOIN photo_credits c ON c.asset_id::text IN (SELECT p->>'assetId' FROM jsonb_array_elements(r.input->'photos') p)
             WHERE e.id=$1`,
            [entryId],
          )
        ).rows;
        return Object.fromEntries(
          rows.map((r) => [r.asset_id, { kind: r.kind, photographer: r.photographer ?? "", sourceUrl: r.source_url ?? "", license: r.license ?? "", retrievedOn: r.retrieved_on ?? "", cropping: r.cropping ?? "" }]),
        ) as Record<string, { kind: PhotoCreditInput["kind"]; photographer: string; sourceUrl: string; license: string; retrievedOn: string; cropping: string }>;
      }),
  };
}

export const cookbookCorrections = () => createCookbookCorrections({ pool: getPool(), dispose: disposeUnusedAsset });
