import { expect, test, vi } from "vitest";
import type { Pool } from "pg";
import { createFavoriteService } from "../../src/features/recipes/favorites";

const id = "d8153cda-d4d5-4135-ba59-142e6d9c5c83";
const member = "11111111-2222-4333-8444-555555555555";
const poolOf = (query: ReturnType<typeof vi.fn>) => ({ query }) as unknown as Pool;

test("state reports the count and whether this member saved the recipe", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ n: 3, mine: true }] });
  const state = await createFavoriteService({ pool: poolOf(query) }).state(member, id);
  expect(state).toEqual({ favorited: true, count: 3 });
  expect(query.mock.calls[0][1]).toEqual([id, member]);
});

test("a guest only gets the count", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ n: 2, mine: false }] });
  const state = await createFavoriteService({ pool: poolOf(query) }).state(null, id);
  expect(state).toEqual({ favorited: false, count: 2 });
  expect(query.mock.calls[0][1]).toEqual([id, null]);
});

test("a failed lookup shows an unsaved recipe instead of breaking the page", async () => {
  const query = vi.fn().mockRejectedValue(new Error("down"));
  expect(await createFavoriteService({ pool: poolOf(query) }).state(member, id)).toEqual({ favorited: false, count: 0 });
});
