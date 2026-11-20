import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "../../server/db.ts";
import { refreshCatalogRow } from "../recipes/catalog.ts";
import { stagedInput, type CookbookEntry } from "./manifest.ts";

export interface ImportSummary {
  created: number;
  updated: number;
  skippedReviewed: number;
}

const hash = (entry: CookbookEntry) => createHash("sha256").update(JSON.stringify(entry)).digest("hex");

/**
 * Stages manifest entries as ownerless, unpublished recipes. Unchanged entries are no-ops and
 * text an admin already approved, and recipes that are no longer drafts, are never overwritten by a re-run.
 */
export async function importCookbook(pool: Pool, entries: CookbookEntry[]): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skippedReviewed: 0 };
  for (const entry of entries) {
    const digest = hash(entry);
    const input = JSON.stringify(stagedInput(entry));
    await transaction(pool, async (client) => {
      const existing = (
        await client.query<{ recipe_id: string; manifest_hash: string; text_review: string; state: string }>(
          "SELECT e.recipe_id,e.manifest_hash,e.text_review,r.state FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id WHERE e.import_key=$1 FOR UPDATE OF e",
          [entry.key],
        )
      ).rows[0];
      const credit = [entry.pages, entry.contributor, entry.originalAuthor, entry.sourceUrls, entry.flags, digest];
      if (!existing) {
        const recipe = (
          await client.query<{ id: string }>(
            "INSERT INTO recipes(owner_id,generation,input) VALUES(NULL,1,$1) RETURNING id",
            [input],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO cookbook_entries(import_key,recipe_id,book_pages,contributor,original_author,source_urls,flags,manifest_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [entry.key, recipe.id, ...credit],
        );
        summary.created++;
        return;
      }
      if (existing.manifest_hash === digest) return;
      // Published (or hidden) recipes are admin-owned now; a re-run never touches them.
      if (existing.state !== "draft" || existing.text_review === "approved") {
        summary.skippedReviewed++;
        return;
      }
      await client.query(
        "UPDATE recipes SET input=$2,version=version+1,updated_at=now() WHERE id=$1 AND state='draft'",
        [existing.recipe_id, input],
      );
      // Approved translations describe the old rows; hide them until re-reviewed.
      await client.query(
        "UPDATE recipe_translations SET status='outdated',updated_at=now() WHERE recipe_id=$1 AND status='approved'",
        [existing.recipe_id],
      );
      await refreshCatalogRow(client, existing.recipe_id);
      await client.query(
        "UPDATE cookbook_entries SET book_pages=$2,contributor=$3,original_author=$4,source_urls=$5,flags=$6,manifest_hash=$7,imported_at=now() WHERE import_key=$1",
        [entry.key, ...credit],
      );
      summary.updated++;
    });
  }
  return summary;
}
