import { expect, test } from "vitest";
import { fitToSource, sourceText } from "../../src/features/recipes/translation-text";
import { emptyRecipe } from "../../src/features/recipes/validation";

const recipe = (names: string[]) => ({
  ...emptyRecipe(),
  title: "Beans",
  ingredients: names.map((name) => ({ kind: "ingredient" as const, quantity: "1", unit: "", name, notes: "" })),
  instructions: [{ kind: "step" as const, text: "Cook." }],
});

test("a proposal written for fewer rows is padded from the original", () => {
  const old = { ...sourceText(recipe(["frijoles", "sal"])), title: "Frijoles" };
  const fitted = fitToSource(old, sourceText(recipe(["beans", "water", "salt"])));
  expect(fitted.title).toBe("Frijoles");
  expect(fitted.ingredients.map((r) => r.name)).toEqual(["frijoles", "sal", "salt"]);
});

test("a proposal written for more rows is trimmed to the recipe", () => {
  const old = sourceText(recipe(["a", "b", "c"]));
  expect(fitToSource(old, sourceText(recipe(["x"]))).ingredients).toHaveLength(1);
});
