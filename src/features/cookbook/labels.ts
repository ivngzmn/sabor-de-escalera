import type { QueueRow } from "./queue";

type Row = Pick<QueueRow, "state" | "missing" | "textReview" | "imageReview" | "eligible" | "sourceClearance">;
const REVIEWS = new Set(["text-review", "image-review", "photo-credit", "photos", "source-permission"]);

/** The checks a book recipe must pass before it can publish. `source` is null when no outside source is involved. */
export function readiness(row: Row) {
  return {
    details: !row.missing.some((m) => !REVIEWS.has(m)),
    source: row.sourceClearance === "not-needed" ? null : row.sourceClearance === "cleared",
    photos: !row.missing.includes("photos") && !row.missing.includes("photo-credit"),
    text: row.textReview === "approved",
    images: row.imageReview === "approved",
  };
}
export type Readiness = ReturnType<typeof readiness>;
export type StepKey = keyof Readiness | "publish";
export interface ReviewStep {
  key: StepKey;
  title: string;
  /** What to check, shown on the step the reviewer is on. */
  help: string;
  status: "done" | "current" | "upcoming";
}
const steps: Omit<ReviewStep, "status">[] = [
  { key: "details", title: "Fill in the details", help: "Use the correction form. Compare the recipe with the book, fix spelling without changing meaning, and add what’s missing. Only enter an origin, servings or time the book or the contributor confirms; never guess." },
  { key: "source", title: "Clear the source", help: "This recipe is adapted from a website. Open the source, find out whether it can be reused here, and write down how that was settled. Being in the book is not permission." },
  { key: "photos", title: "Add photos and credits", help: "Add 1–6 photos with captions, save, then record a credit for each one. Use photos the contributor permitted, individually checked Pexels or Unsplash photos, or approved AI images." },
  { key: "images", title: "Approve the images", help: "Check that each photo shows this dish, looks right cropped, has an accurate caption, and that its credit matches its source." },
  { key: "text", title: "Review the text", help: "Do this last. Read the preview against the book: amounts, units, steps and credits. Go through every transcription note. Correcting the text afterwards sends it back for review." },
  { key: "publish", title: "Publish", help: "Read the preview once more. Publishing makes the recipe public straight away." },
];
/** The recommended order of work. Done steps stay done; the first unfinished one is where the reviewer is. */
export function reviewSteps(row: Row): ReviewStep[] {
  const checked = readiness(row);
  let found = false;
  return steps
    .filter((s) => s.key === "publish" || checked[s.key] !== null)
    .map((s) => {
      const done = s.key === "publish" ? row.state === "published" : checked[s.key] === true;
      const status = done ? "done" : found ? "upcoming" : "current";
      if (!done) found = true;
      return { ...s, status };
    });
}

/** Where a recipe is in the review, in words: "Step 2 of 6: Clear the source". */
export function stepSummary(row: Row) {
  if (row.state === "published") return "Published";
  const all = reviewSteps(row);
  const index = all.findIndex((s) => s.status === "current");
  return `Step ${index + 1} of ${all.length}: ${all[index].title}`;
}

/** The first few things a recipe lacks, as a sentence. Review steps are left out; the step summary covers those. */
export function stillNeeds(missing: string[], limit = 3) {
  const labels = missing.filter((m) => m !== "text-review" && m !== "image-review").map(missingLabel);
  if (!labels.length) return "";
  if (labels.length === 1) return `Still needs ${labels[0]}`;
  if (labels.length <= limit) return `Still needs ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Still needs ${labels.slice(0, limit).join(", ")} and ${labels.length - limit} more`;
}

export function summarize(rows: Row[]) {
  const published = rows.filter((r) => r.state === "published").length;
  const ready = rows.filter((r) => r.state !== "published" && r.eligible).length;
  return { total: rows.length, published, ready, blocked: rows.length - published - ready };
}

const sentence = (code: string) => {
  const words = code.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const missingLabels: Record<string, string> = {
  title: "Title",
  category: "Category",
  origin: "Origin",
  yieldText: "Yield",
  baseline: "Servings for scaling",
  baselineConfirmed: "Confirmed servings",
  timing: "Time",
  ingredients: "Ingredients",
  instructions: "Steps",
  photos: "Photos",
  "photo-credit": "Photo credits",
  "source-permission": "Source permission",
  "text-review": "Text review",
  "image-review": "Image review",
};
export const missingLabel = (code: string) => missingLabels[code] ?? sentence(code);

const flagLabels: Record<string, string> = {
  "origin-unassigned": "No origin in the book",
  "third-party-source": "Adapted from a website",
  "timing-range": "Time given as a range",
  "timing-missing": "No time in the book",
  "timing-prep-only": "Only prep time given",
  "timing-excludes-soak": "Time leaves out soaking",
  "yield-missing": "No yield in the book",
  "yield-unclear": "Unclear yield",
  "unit-missing": "Amount without a unit",
  "quantity-unclear": "Unclear amount",
  "quantity-missing": "Missing amount",
  "quantity-check": "Check an amount",
  "ingredient-missing": "Step uses an unlisted ingredient",
  "ingredient-unused": "Ingredient never used",
  "step-unclear": "Unclear step",
  "title-spelling-check": "Title spelling corrected",
  "metric-amounts-unscaled": "Gram amounts won’t scale",
  "contributor-missing": "No contributor named",
  "original-author-blank": "Original author left blank",
  "source-url-mismatch": "Linked source is a different recipe",
  "source-url-missing": "No source link",
  "category-unassigned": "No category in the book",
};
/** Flags may name a row counted from 1 (quantity-unclear:2 → ingredient 2, step-unclear:3 → step 3) or an ingredient (ingredient-missing:oil). */
export function flagLabel(flag: string) {
  const [code, detail] = flag.split(":");
  const label = flagLabels[code] ?? sentence(code);
  if (!detail) return label;
  if (!/^\d+$/.test(detail)) return `${label} (${detail.replaceAll("-", " ")})`;
  return `${label} (${code.startsWith("step") ? "step" : "ingredient"} ${Number(detail)})`;
}
