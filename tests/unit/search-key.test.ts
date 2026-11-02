import { expect, test } from "vitest";
import { searchKey } from "../../src/features/recipes/search-key";

test("search keys ignore accents, case and extra whitespace", () => {
  expect(searchKey("  Ají  de GALLINA ")).toBe("aji de gallina");
  expect(searchKey("Crème Brûlée")).toBe("creme brulee");
  expect(searchKey("Jalapeño\npoppers")).toBe("jalapeno poppers");
});
