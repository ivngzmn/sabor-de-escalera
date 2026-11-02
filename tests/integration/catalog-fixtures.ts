import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { emptyRecipe, type RecipeInput } from "../../src/features/recipes/validation";

// Published rows are inserted directly so tests are not bound by publication rate limits.
export async function publishedRecipe(
  pool: Pool,
  ownerId: string,
  overrides: Partial<RecipeInput> = {},
  publishedAt = new Date(),
): Promise<string> {
  const { refreshCatalogRow } = await import("../../src/features/recipes/catalog");
  const id = randomUUID();
  const input: RecipeInput = {
    ...emptyRecipe(),
    title: "Fixture recipe",
    category: "main",
    origin: "not-sure",
    yieldText: "4 servings",
    baseline: 4,
    baselineConfirmed: true,
    timing: { mode: "total", total: 30, prep: null, cook: null, rest: null },
    ingredients: [{ kind: "ingredient", quantity: "1", unit: "cup", name: "rice", notes: "" }],
    instructions: [{ kind: "step", text: "Cook." }],
    ...overrides,
  };
  await pool.query(
    "INSERT INTO recipes(id,owner_id,state,generation,input,slug,first_published_at,updated_at) VALUES($1,$2,'published',1,$3,'fixture',$4,$4)",
    [id, ownerId, JSON.stringify(input), publishedAt],
  );
  const client = await pool.connect();
  try {
    await refreshCatalogRow(client, id);
  } finally {
    client.release();
  }
  return id;
}

export async function rate(pool: Pool, recipeId: string, memberIds: string[], stars: number[]) {
  for (const [i, memberId] of memberIds.entries())
    await pool.query("INSERT INTO recipe_ratings(member_id,recipe_id,stars) VALUES($1,$2,$3)", [memberId, recipeId, stars[i]]);
}
