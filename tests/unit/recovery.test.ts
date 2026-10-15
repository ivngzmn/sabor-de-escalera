import { expect, test } from "vitest";
import { emptyRecipe } from "../../src/features/recipes/validation";

function storage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}
test("recovery is opt-in, scopes logout cleanup, refuses changed generations and stores no arbitrary image bytes", async () => {
  const recovery = await import("../../src/features/recipes/recovery").catch(
    () => null,
  );
  expect(recovery?.writeRecovery).toBeTypeOf("function");
  if (!recovery) return;
  const store = storage();
  const record = {
    id: "a",
    version: 2,
    generation: 1,
    input: { ...emptyRecipe(), title: "Unsaved" },
  };
  recovery.writeRecovery(store, false, "member", record);
  expect(store.length).toBe(0);
  recovery.writeRecovery(store, true, "member", record);
  expect(
    recovery.readRecovery(store, true, "member", { id: "a", generation: 1 }),
  ).toMatchObject({ input: { title: "Unsaved" } });
  expect(
    recovery.readRecovery(store, false, "member", { id: "a", generation: 1 }),
  ).toBeNull();
  expect(
    recovery.readRecovery(store, true, "member", { id: "a", generation: 2 }),
  ).toBeNull();
  recovery.writeRecovery(store, true, "member", record);
  recovery.writeRecovery(store, true, "other", record);
  store.setItem("clerk:session", "keep");
  recovery.clearAccountRecovery(store, "member");
  expect(store.getItem("clerk:session")).toBe("keep");
  expect(
    recovery.readRecovery(store, true, "other", { id: "a", generation: 1 }),
  ).not.toBeNull();
  recovery.writeRecovery(store, true, "member", {
    ...record,
    input: {
      ...record.input,
      photos: [
        {
          assetId: "data:image/jpeg;base64,secret",
          caption: "x",
          alt: "",
          crop: { x: 50, y: 50, zoom: 1 },
        },
      ],
    },
  });
  expect(
    recovery.readRecovery(store, true, "member", { id: "a", generation: 1 }),
  ).toBeNull();
});
test("JSONB key order does not make a saved draft appear dirty; row order still matters", async () => {
  const v = await import("../../src/features/recipes/validation");
  const compare = (
    v as typeof v & { sameRecipe?: (a: unknown, b: unknown) => boolean }
  ).sameRecipe;
  expect(compare).toBeTypeOf("function");
  if (!compare) return;
  expect(compare({ title: "A", photos: [] }, { photos: [], title: "A" })).toBe(
    true,
  );
  expect(
    compare({ ingredients: ["a", "b"] }, { ingredients: ["b", "a"] }),
  ).toBe(false);
});
test("nested arbitrary fields cannot smuggle image bytes into recovery", async () => {
  const { validateDraft } =
    await import("../../src/features/recipes/validation");
  expect(
    validateDraft({
      ...emptyRecipe(),
      timing: { ...emptyRecipe().timing, file: "data:image/png;base64,secret" },
    }),
  ).not.toEqual([]);
});
