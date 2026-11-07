import { expect, test } from "vitest";
import { flagLabel, missingLabel, nextToReview, readiness, reviewSteps, stepSummary, stillNeeds, summarize } from "../../src/features/cookbook/labels";

const row = (over: Partial<Parameters<typeof readiness>[0]> = {}) => ({
  state: "draft",
  missing: ["origin", "baseline", "photos", "text-review", "image-review"],
  textReview: "pending" as const,
  imageReview: "missing" as const,
  eligible: false,
  sourceClearance: "not-needed" as const,
  ...over,
});

test("readiness splits blockers into the four checks an editor works through", () => {
  expect(readiness(row())).toEqual({ details: false, source: null, photos: false, text: false, images: false });
  expect(readiness(row({ missing: ["photo-credit"], textReview: "approved", imageReview: "approved" }))).toEqual({ details: true, source: null, photos: false, text: true, images: true });
  expect(readiness(row({ missing: [], textReview: "approved", imageReview: "approved", eligible: true }))).toEqual({ details: true, source: null, photos: true, text: true, images: true });
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

const current = (r: ReturnType<typeof row>) => reviewSteps(r).find((s) => s.status === "current")?.key;

test("review steps point at the next thing to do, in order", () => {
  expect(current(row())).toBe("details");
  expect(current(row({ missing: ["photos", "text-review", "image-review"] }))).toBe("photos");
  expect(current(row({ missing: ["photo-credit", "text-review", "image-review"], imageReview: "pending" }))).toBe("photos");
  expect(current(row({ missing: ["text-review", "image-review"], imageReview: "pending" }))).toBe("images");
  expect(current(row({ missing: ["text-review"], imageReview: "approved" }))).toBe("text");
  expect(current(row({ missing: [], textReview: "approved", imageReview: "approved", eligible: true }))).toBe("publish");
  expect(reviewSteps(row()).map((s) => s.key)).toEqual(["details", "photos", "images", "text", "publish"]);
});

test("a website-adapted recipe gets a source step that must be cleared", () => {
  const flagged = row({ missing: ["source-permission", "photos", "text-review", "image-review"], sourceClearance: "pending" });
  expect(readiness(flagged)).toMatchObject({ details: true, source: false });
  expect(current(flagged)).toBe("source");
  expect(reviewSteps(flagged).map((s) => s.key)).toEqual(["details", "source", "photos", "images", "text", "publish"]);
  expect(missingLabel("source-permission")).toBe("Source permission");
});

test("every step says what to check, and finished work is marked done", () => {
  const steps = reviewSteps(row({ missing: ["text-review"], imageReview: "approved" }));
  expect(steps.every((s) => s.help.length > 20)).toBe(true);
  expect(steps.map((s) => s.status)).toEqual(["done", "done", "done", "current", "upcoming"]);
});

test("a recipe's place in the review reads as a plain sentence", () => {
  expect(stepSummary(row())).toBe("Step 1 of 5: Fill in the details");
  expect(stepSummary(row({ missing: ["source-permission", "photos", "text-review", "image-review"], sourceClearance: "pending" }))).toBe("Step 2 of 6: Clear the source");
  expect(stepSummary(row({ missing: [], textReview: "approved", imageReview: "approved", eligible: true }))).toBe("Step 5 of 5: Publish");
  expect(stepSummary(row({ state: "published", missing: [], textReview: "approved", imageReview: "approved" }))).toBe("Published");
});

test("what's missing reads as a short sentence, without the review steps", () => {
  expect(stillNeeds(["origin", "yieldText", "baseline", "timing", "photos", "text-review", "image-review"])).toBe("Still needs Origin, Yield, Servings for scaling and 2 more");
  expect(stillNeeds(["origin", "text-review"])).toBe("Still needs Origin");
  expect(stillNeeds(["origin", "photos"])).toBe("Still needs Origin and Photos");
  expect(stillNeeds(["text-review", "image-review"])).toBe("");
});

test("the next recipe is the next unpublished one in book order, wrapping around", () => {
  const list = [
    { entryId: "a", state: "published" },
    { entryId: "b", state: "draft" },
    { entryId: "c", state: "published" },
    { entryId: "d", state: "draft" },
  ];
  expect(nextToReview(list, "b")).toBe("d");
  expect(nextToReview(list, "c")).toBe("d");
  expect(nextToReview(list, "d")).toBe("b");
  expect(nextToReview([{ entryId: "a", state: "draft" }], "a")).toBeNull();
  expect(nextToReview([{ entryId: "a", state: "published" }], "a")).toBeNull();
});
