import type { QueueRow } from "./queue";

type Row = Pick<QueueRow, "state" | "missing" | "textReview" | "imageReview" | "eligible">;
const REVIEWS = new Set(["text-review", "image-review", "photo-credit", "photos"]);

/** The four checks an editor works through before a book recipe can publish. A checklist, not a sequence. */
export function readiness(row: Row) {
  return {
    details: !row.missing.some((m) => !REVIEWS.has(m)),
    photos: !row.missing.includes("photos") && !row.missing.includes("photo-credit"),
    text: row.textReview === "approved",
    images: row.imageReview === "approved",
  };
}
export type Readiness = ReturnType<typeof readiness>;
export const checks: { key: keyof Readiness; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "photos", label: "Photos & credits" },
  { key: "text", label: "Text reviewed" },
  { key: "images", label: "Images reviewed" },
];

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
