import type { Pool } from "pg";
import type { Actor } from "../accounts/service";
import { getPool } from "../../server/db";
import { isId, type Result } from "./validation";

const fail = (status: number, message: string): Result<never> => ({ ok: false, error: { status, message } });

// Suspension blocks contributions, not saving: suspended members keep favorites.
export function createFavoriteService({ pool }: { pool: Pool }) {
  async function guard(actor: Actor | null, recipeId: string) {
    if (!actor || !isId(actor.id)) return fail(401, "Sign in to save recipes.");
    if (!actor.onboarded) return fail(403, "Finish your profile to save recipes.");
    if (!isId(recipeId)) return fail(404, "Recipe unavailable.");
    return null;
  }
  return {
    async add(actor: Actor | null, recipeId: string): Promise<Result<{ favorited: true }>> {
      const denied = await guard(actor, recipeId);
      if (denied) return denied;
      try {
        const inserted = await pool.query(
          "INSERT INTO recipe_favorites(member_id,recipe_id) SELECT $1,id FROM recipes WHERE id=$2 AND state='published' ON CONFLICT DO NOTHING RETURNING 1",
          [actor!.id, recipeId],
        );
        if (!inserted.rowCount) {
          const live = await pool.query("SELECT 1 FROM recipes WHERE id=$1 AND state='published'", [recipeId]);
          if (!live.rowCount) return fail(404, "Recipe unavailable.");
        }
        return { ok: true, value: { favorited: true } };
      } catch {
        return fail(503, "Saving is unavailable. Please retry.");
      }
    },
    async remove(actor: Actor | null, recipeId: string): Promise<Result<{ favorited: false }>> {
      const denied = await guard(actor, recipeId);
      if (denied) return denied;
      try {
        await pool.query("DELETE FROM recipe_favorites WHERE member_id=$1 AND recipe_id=$2", [actor!.id, recipeId]);
        return { ok: true, value: { favorited: false } };
      } catch {
        return fail(503, "Saving is unavailable. Please retry.");
      }
    },
  };
}

export const favoriteService = () => createFavoriteService({ pool: getPool() });
