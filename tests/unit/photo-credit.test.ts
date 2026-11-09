import { expect, test } from "vitest";
import { photoCreditText } from "../../src/features/recipes/photo-credit";

test("credits name the photographer and site, and label replacement images", () => {
  expect(photoCreditText({ kind: "owner", photographer: "Ana Ruiz", site: null, label: "none" }, "en")).toBe("Photo by Ana Ruiz");
  expect(photoCreditText({ kind: "stock", photographer: "Sam Lee", site: "Unsplash", label: "illustrative" }, "en")).toBe("Illustrative photo · Photo by Sam Lee on Unsplash");
  expect(photoCreditText({ kind: "stock", photographer: "Sam Lee", site: "Pexels", label: "illustrative" }, "es")).toBe("Foto ilustrativa · Foto de Sam Lee en Pexels");
  expect(photoCreditText({ kind: "ai", photographer: null, site: null, label: "ai-illustrative" }, "en")).toBe("AI-generated illustrative image");
  expect(photoCreditText({ kind: "ai", photographer: null, site: null, label: "ai-illustrative" }, "es")).toBe("Imagen ilustrativa generada por IA");
  expect(photoCreditText(undefined, "en")).toBe("");
});
