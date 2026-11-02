import type { RecipeInput } from "./validation";

/** Translatable author text. Row counts and kinds mirror the source recipe; quantities are never translated. */
export interface TranslatableText {
  title: string;
  story: string;
  notes: string;
  yieldText: string;
  ingredients: { name: string; notes: string; unit: string }[];
  instructions: { text: string }[];
  captions: string[];
}

/** Text a translator starts from: the source recipe's own words. */
export function sourceText(input: RecipeInput): TranslatableText {
  return {
    title: input.title,
    story: input.story,
    notes: input.notes,
    yieldText: input.yieldText,
    ingredients: input.ingredients.map(({ name, notes, unit }) => ({ name, notes, unit })),
    instructions: input.instructions.map(({ text }) => ({ text })),
    captions: input.photos.map((p) => p.caption),
  };
}

/** Overlays an approved translation; rows it does not cover keep the original text. */
export function applyTranslation(input: RecipeInput, text: TranslatableText, language: "en" | "es"): RecipeInput {
  return {
    ...input,
    language,
    title: text.title || input.title,
    story: text.story,
    notes: text.notes,
    yieldText: text.yieldText || input.yieldText,
    ingredients: input.ingredients.map((row, i) => ({ ...row, ...(text.ingredients[i] ?? {}), quantity: row.quantity })),
    instructions: input.instructions.map((row, i) => ({ ...row, text: text.instructions[i]?.text || row.text })),
    photos: input.photos.map((p, i) => {
      const caption = text.captions[i] || p.caption;
      return { ...p, caption, alt: text.captions[i] ? caption : p.alt };
    }),
  };
}

/** Fits saved text to the recipe's current rows; rows the text lacks start from the original, extra rows are dropped. */
export function fitToSource(text: TranslatableText, original: TranslatableText): TranslatableText {
  const fit = <T,>(rows: T[], from: T[]) => from.map((row, i) => rows[i] ?? row);
  return {
    ...text,
    ingredients: fit(text.ingredients, original.ingredients),
    instructions: fit(text.instructions, original.instructions),
    captions: fit(text.captions, original.captions),
  };
}
