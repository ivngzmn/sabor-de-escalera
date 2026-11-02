import { expect, test } from "vitest";
import { flagLabel, missingLabel, readiness, summarize } from "../../src/features/cookbook/labels";

const row = (over: Partial<Parameters<typeof readiness>[0]> = {}) => ({
  state: "draft",
  missing: ["origin", "baseline", "photos", "text-review", "image-review"],
  textReview: "pending" as const,
  imageReview: "missing" as const,
  eligible: false,
  ...over,
});

test("readiness splits blockers into the four checks an editor works through", () => {
  expect(readiness(row())).toEqual({ details: false, photos: false, text: false, images: false });
  expect(readiness(row({ missing: ["photo-credit"], textReview: "approved", imageReview: "approved" }))).toEqual({ details: true, photos: false, text: true, images: true });
  expect(readiness(row({ missing: [], textReview: "approved", imageReview: "approved", eligible: true }))).toEqual({ details: true, photos: true, text: true, images: true });
});

test("codes read as plain words, and unknown codes still read sensibly", () => {
  expect(missingLabel("baseline")).toBe("Servings for scaling");
  expect(missingLabel("photo-credit")).toBe("Photo credits");
  expect(missingLabel("someNewField")).toBe("Some new field");
  expect(flagLabel("third-party-source")).toBe("Adapted from a website");
  expect(flagLabel("quantity-unclear:2")).toBe("Unclear amount (ingredient 2)");
  expect(flagLabel("step-unclear:3")).toBe("Unclear step (step 3)");
  expect(flagLabel("ingredient-missing:lemon-juice")).toBe("Step uses an unlisted ingredient (lemon juice)");
  expect(flagLabel("brand-new-flag")).toBe("Brand new flag");
});

test("the book summary counts published, ready and blocked recipes", () => {
  expect(summarize([row({ state: "published", missing: [] }), row({ eligible: true, missing: [] }), row(), row()])).toEqual({ total: 4, published: 1, ready: 1, blocked: 2 });
});
