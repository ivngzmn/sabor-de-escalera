export interface ExampleRecipe {
  key: string;
  language: 'en' | 'es';
  flags: string[];
  sourceUrls?: string[];
  title: string;
  category: string;
  origin: string;
  yieldText: string;
  baseline: number;
  dietary?: ('vegan' | 'vegetarian')[];
  timing: { mode: 'total' | 'parts'; total: number | null; prep: number | null; cook: number | null; rest: number | null };
  story: string;
  ingredients: (string | [string, string, string])[];
  steps: string[];
  photos: [string, string][];
}
export interface ExampleFile {
  origins: [string, string, string][];
  recipes: ExampleRecipe[];
}

/** Expands the short form in example-recipes.json into cookbook manifest entries. Pages sort examples after the book. */
export function exampleEntries(data: ExampleFile) {
  return data.recipes.map((r, index) => ({
    key: r.key,
    pages: [401 + index],
    contributor: 'Example recipe (test data)',
    originalAuthor: null,
    sourceUrls: r.sourceUrls ?? [],
    language: r.language,
    flags: r.flags,
    recipe: {
      title: r.title,
      category: r.category,
      origin: r.origin,
      yieldText: r.yieldText,
      baseline: r.baseline,
      timing: r.timing,
      story: r.story,
      dietary: r.dietary ?? [],
      ingredients: r.ingredients.map((row) =>
        typeof row === 'string'
          ? { kind: 'section' as const, quantity: '', unit: '', name: row.replace(/^# /, ''), notes: '' }
          : { kind: 'ingredient' as const, quantity: row[0], unit: row[1], name: row[2], notes: '' },
      ),
      instructions: r.steps.map((text) => ({ kind: 'step' as const, text })),
    },
  }));
}
