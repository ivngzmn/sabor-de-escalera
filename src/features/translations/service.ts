import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Actor } from "../accounts/service";
import { getPool, transaction } from "../../server/db";
import { createCatalogService, refreshCatalogRow } from "../recipes/catalog";
import type { TranslatableText } from "../recipes/translation-text";
import { isId, type RecipeInput, type Result } from "../recipes/validation";

// Manual review only: AUTO_TRANSLATION_ENABLED stays false and nothing here calls a provider.
const text = (max: number) => z.string().max(max);
const translatable = z
  .object({
    title: text(200).min(1),
    story: text(10000),
    notes: text(10000),
    yieldText: text(200),
    ingredients: z.array(z.object({ name: text(400), notes: text(400), unit: text(60) }).strict()),
    instructions: z.array(z.object({ text: text(4000) }).strict()),
    captions: z.array(text(400)),
  })
  .strict();

class TranslationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return e instanceof TranslationError
      ? { ok: false, error: { status: e.status, message: e.message } }
      : { ok: false, error: { status: 503, message: "Translations are unavailable. Please retry." } };
  }
}

export function createTranslationService({ pool }: { pool: Pool }) {
  // The database role decides, not the role carried on the actor.
  async function requireAdmin(client: PoolClient, actor: Actor | null) {
    if (!actor || !isId(actor.id)) throw new TranslationError(401, "Sign-in required.");
    const row = (await client.query("SELECT role FROM members WHERE id=$1 AND onboarded_at IS NOT NULL", [actor.id])).rows[0];
    if (!row || !["admin", "owner"].includes(row.role)) throw new TranslationError(403, "Admin access required.");
  }
  async function source(client: PoolClient, recipeId: string) {
    if (!isId(recipeId)) throw new TranslationError(404, "Recipe not found.");
    const r = (
      await client.query<{ input: RecipeInput; version: number; language: string; state: string }>(
        "SELECT input,version,language,state FROM recipes WHERE id=$1 FOR UPDATE",
        [recipeId],
      )
    ).rows[0];
    if (!r || r.state === "deleted") throw new TranslationError(404, "Recipe not found.");
    return r;
  }
  return {
    /** Saves a proposed translation for the recipe's current version; any earlier proposal for that language is replaced. */
    saveTranslation: (actor: Actor | null, recipeId: string, language: "en" | "es", sourceVersion: number, input: unknown) =>
      result(() =>
        transaction(pool, async (client) => {
          await requireAdmin(client, actor);
          const r = await source(client, recipeId);
          if (language !== "en" && language !== "es") throw new TranslationError(400, "Unknown language.");
          if (language === (r.input.language ?? r.language)) throw new TranslationError(400, "That is the recipe's original language.");
          if (r.version !== sourceVersion) throw new TranslationError(409, "The recipe changed. Reload it before translating.");
          const parsed = translatable.safeParse(input);
          if (!parsed.success) throw new TranslationError(400, "Check the translation fields.");
          const t = parsed.data;
          if (
            t.ingredients.length !== r.input.ingredients.length ||
            t.instructions.length !== r.input.instructions.length ||
            t.captions.length !== r.input.photos.length
          )
            throw new TranslationError(400, "Every ingredient, step and caption needs its own translation row.");
          await client.query("DELETE FROM recipe_translations WHERE recipe_id=$1 AND language=$2 AND status='proposed'", [recipeId, language]);
          const row = (
            await client.query<{ id: string }>(
              "INSERT INTO recipe_translations(recipe_id,language,source_version,status,input,edited_by) VALUES($1,$2,$3,'proposed',$4,$5) RETURNING id",
              [recipeId, language, sourceVersion, JSON.stringify(t), actor!.id],
            )
          ).rows[0];
          return { id: row.id, status: "proposed" as const };
        }),
      ),
    /** Approves proposals in one transaction. Rows whose recipe moved past their source version are reported, not approved. */
    approveTranslations: (actor: Actor | null, items: { id: string; sourceVersion: number }[]) =>
      result(() =>
        transaction(pool, async (client) => {
          await requireAdmin(client, actor);
          if (!Array.isArray(items) || items.length > 200) throw new TranslationError(400, "Approve at most 200 translations at once.");
          const conflicts: string[] = [];
          let approved = 0;
          for (const item of items) {
            if (!isId(item?.id) || !Number.isSafeInteger(item.sourceVersion)) throw new TranslationError(400, "Invalid request.");
            const row = (
              await client.query<{ recipe_id: string; language: string; source_version: number; status: string; version: number }>(
                "SELECT t.recipe_id,t.language,t.source_version,t.status,r.version FROM recipe_translations t JOIN recipes r ON r.id=t.recipe_id WHERE t.id=$1 FOR UPDATE OF t, r",
                [item.id],
              )
            ).rows[0];
            if (!row || row.status !== "proposed" || row.source_version !== item.sourceVersion || row.version !== item.sourceVersion) {
              conflicts.push(item.id);
              continue;
            }
            await client.query(
              "UPDATE recipe_translations SET status='outdated',updated_at=now() WHERE recipe_id=$1 AND language=$2 AND status='approved'",
              [row.recipe_id, row.language],
            );
            await client.query("UPDATE recipe_translations SET status='approved',approved_by=$2,updated_at=now() WHERE id=$1", [item.id, actor!.id]);
            await refreshCatalogRow(client, row.recipe_id);
            approved++;
          }
          return { approved, conflicts };
        }),
      ),
    /** Current proposal and approved text for the admin editor. */
    readForReview: (actor: Actor | null, recipeId: string) =>
      result(() =>
        transaction(pool, async (client) => {
          await requireAdmin(client, actor);
          const r = await source(client, recipeId);
          const rows = (
            await client.query<{ id: string; language: "en" | "es"; status: string; source_version: number; input: TranslatableText }>(
              "SELECT id,language,status,source_version,input FROM recipe_translations WHERE recipe_id=$1 AND status IN ('proposed','approved') ORDER BY updated_at DESC",
              [recipeId],
            )
          ).rows;
          return { input: r.input, version: r.version, translations: rows };
        }),
      ),
    readerTranslation: (recipeId: string, language: "en" | "es") => createCatalogService({ pool }).readerTranslation(recipeId, language),
  };
}

export const translationService = () => createTranslationService({ pool: getPool() });
