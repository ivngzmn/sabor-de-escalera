import { expect, test } from "vitest";
import { clampServings, scaleQuantity } from "../../src/features/recipes/scaling";

test("scaleQuantity edge cases", () => {
  expect(scaleQuantity("1 1/2", 2).text).toBe("3");
  expect(scaleQuantity("½", 3).text).toBe("1½");
  expect(scaleQuantity("2-3", 2).text).toBe("4-6");
  expect(scaleQuantity("2–3", 2).text).toBe("4–6");
  expect(scaleQuantity("2 to 3", 0.5).text).toBe("1 to 1½");
  expect(scaleQuantity("1/3", 2).text).toBe("2/3");
  expect(scaleQuantity("0.5", 3).text).toBe("1.5");
  expect(scaleQuantity("3", 1.5)).toEqual({ text: "4½", scaled: true });
  expect(scaleQuantity("½–1", 2).text).toBe("1–2");
  expect(scaleQuantity("a pinch", 4)).toEqual({ text: "a pinch", scaled: false });
  expect(scaleQuantity("to taste", 2).scaled).toBe(false);
  expect(scaleQuantity("1 can (size not given)", 2)).toEqual({ text: "1 can (size not given)", scaled: false });
  expect(scaleQuantity("", 2)).toEqual({ text: "", scaled: false });
  expect(scaleQuantity("2", 1)).toEqual({ text: "2", scaled: false });
});

test("clampServings keeps whole servings between 1 and 99", () => {
  expect(clampServings(0)).toBe(1);
  expect(clampServings(500)).toBe(99);
  expect(clampServings(2.6)).toBe(3);
  expect(clampServings(Number.NaN)).toBe(1);
});

test("ambiguous notations are preserved rather than mis-scaled", () => {
  expect(scaleQuantity("1-1/2", 2)).toEqual({ text: "1-1/2", scaled: false });
  expect(scaleQuantity("1 - 1/2", 2)).toEqual({ text: "1 - 1/2", scaled: false });
  expect(scaleQuantity("3-2", 2)).toEqual({ text: "3-2", scaled: false });
  expect(scaleQuantity("1,000", 2)).toEqual({ text: "1,000", scaled: false });
  expect(scaleQuantity("1,5", 2).text).toBe("3");
});
