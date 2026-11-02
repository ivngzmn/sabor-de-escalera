import { z } from "zod";
// .ts specifiers let scripts/import-cookbook.ts run under Node type stripping.
import { emptyRecipe, safeWebUrl, validateDraft, type RecipeInput, type Result } from "../recipes/validation.ts";

const row = z.object({
  kind: z.enum(["ingredient", "section"]),
  quantity: z.string(),
  unit: z.string(),
  name: z.string(),
  notes: z.string(),
});
// Photos and a confirmed scaling baseline are never imported: images need permission review and the baseline needs a person.
const recipe = z
  .object({
    title: z.string(),
    category: z.string(),
    origin: z.string(),
    yieldText: z.string(),
    baseline: z.number().int().positive().nullable(),
    timing: z.object({
      mode: z.enum(["total", "parts"]),
      total: z.number().int().positive().nullable(),
      prep: z.number().int().positive().nullable(),
      cook: z.number().int().positive().nullable(),
      rest: z.number().int().positive().nullable(),
    }),
    story: z.string(),
    sourceCredit: z.string(),
    videoUrl: z.string(),
    notes: z.string(),
    dietary: z.array(z.enum(["vegan", "vegetarian"])),
    ingredients: z.array(row),
    instructions: z.array(z.object({ kind: z.enum(["step", "section"]), text: z.string() })),
  })
  .partial()
  .strict();

export const CookbookEntry = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{1,120}$/),
    pages: z.array(z.number().int().min(1).max(500)).min(1),
    contributor: z.string().trim().min(1).max(200).nullable(),
    originalAuthor: z.string().trim().min(1).max(200).nullable(),
    sourceUrls: z.array(z.string().max(2000).refine(safeWebUrl, "Use full http or https links.")),
    language: z.enum(["en", "es"]),
    flags: z.array(z.string().regex(/^[a-z0-9:-]{1,80}$/)),
    recipe,
  })
  .strict();
export type CookbookEntry = z.infer<typeof CookbookEntry>;

/** The staged recipe text: author fields over an empty recipe, never photos or a confirmed baseline. */
export function stagedInput(entry: CookbookEntry): RecipeInput {
  return { ...emptyRecipe(), ...entry.recipe, language: entry.language, baselineConfirmed: false, photos: [] };
}

/** Validates the local manifest. Book text lives only in the gitignored file passed here. */
export function parseManifest(json: unknown): Result<CookbookEntry[]> {
  const parsed = z.array(CookbookEntry).safeParse(json);
  if (!parsed.success)
    return { ok: false, error: { status: 422, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 20).join("; ") } };
  const seen = new Set<string>();
  for (const entry of parsed.data) {
    if (seen.has(entry.key)) return { ok: false, error: { status: 422, message: `Duplicate key ${entry.key}` } };
    seen.add(entry.key);
    const fields = validateDraft(stagedInput(entry));
    if (fields.length)
      return { ok: false, error: { status: 422, message: `${entry.key}: ${fields.map((f) => `${f.field} ${f.message}`).join("; ")}`, fields } };
  }
  return { ok: true, value: parsed.data };
}
