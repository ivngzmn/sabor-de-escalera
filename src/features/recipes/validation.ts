export const categories = [
  { id: "sides", en: "Appetizers & Sides", es: "Aperitivos y acompañamientos" },
  { id: "main", en: "Main Dishes", es: "Platos principales" },
  { id: "desserts", en: "Desserts", es: "Postres" },
  { id: "beverages", en: "Beverages", es: "Bebidas" },
];
export interface Photo {
  width?: number;
  height?: number;
  assetId: string;
  caption: string;
  alt: string;
  crop: { x: number; y: number; zoom: number };
}
export interface Ingredient {
  kind: "ingredient" | "section";
  quantity: string;
  unit: string;
  name: string;
  notes: string;
}
export interface Instruction {
  kind: "step" | "section";
  text: string;
}
export interface RecipeInput {
  title: string;
  category: string;
  origin: string;
  yieldText: string;
  baseline: number | null;
  baselineConfirmed: boolean;
  timing: {
    mode: "total" | "parts";
    total: number | null;
    prep: number | null;
    cook: number | null;
    rest: number | null;
  };
  story: string;
  sourceCredit: string;
  videoUrl: string;
  notes: string;
  language: "en" | "es";
  dietary: string[];
  photos: Photo[];
  ingredients: Ingredient[];
  instructions: Instruction[];
}
export interface FieldError {
  field: string;
  step: number;
  message: string;
}
export interface Origin {
  id: string;
  label_en: string;
  label_es: string;
}
export interface Draft {
  id: string;
  version: number;
  generation: number;
  label: string;
  input: RecipeInput;
  state: string;
  url: string | null;
  updatedAt: string;
  publishedAt: string | null;
}
export interface Failure {
  status: number;
  message: string;
  fields?: FieldError[];
  retryAfter?: number;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };
export const isId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
export function emptyRecipe(): RecipeInput {
  return {
    title: "",
    category: "",
    origin: "",
    yieldText: "",
    baseline: null,
    baselineConfirmed: false,
    timing: { mode: "total", total: null, prep: null, cook: null, rest: null },
    story: "",
    sourceCredit: "",
    videoUrl: "",
    notes: "",
    language: "en",
    dietary: [],
    photos: [],
    ingredients: [],
    instructions: [],
  };
}
export function safeWebUrl(url: string): boolean {
  try {
    const value = new URL(url);
    return (
      ["http:", "https:"].includes(value.protocol) &&
      !!value.hostname &&
      !value.username &&
      !value.password &&
      !Array.from(url).some(
        (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
      )
    );
  } catch {
    return false;
  }
}
export function totalMinutes(input: RecipeInput) {
  const t = input.timing;
  return t.mode === "total"
    ? t.total
    : t.prep === null || t.cook === null
      ? null
      : t.prep + t.cook + (t.rest ?? 0);
}
// Author text remains text. React/Astro context escaping is mandatory at render;
// stripping angle brackets would silently corrupt quantities and author values.
export function validateDraft(value: unknown): FieldError[] {
  const errors: FieldError[] = [];
  const error = (field: string, step: number, message: string) =>
    errors.push({ field, step, message });
  if (!value || typeof value !== "object" || Array.isArray(value))
    return [{ field: "title", step: 0, message: "Invalid recipe." }];
  const v = value as RecipeInput;
  const only = (
    obj: unknown,
    allowed: string[],
    field: string,
    step: number,
  ) => {
    if (
      !obj ||
      typeof obj !== "object" ||
      Array.isArray(obj) ||
      Object.keys(obj).some((k) => !allowed.includes(k))
    )
      error(field, step, "Unknown or invalid field.");
  };
  const keys = Object.keys(emptyRecipe());
  if (Object.keys(v).some((k) => !keys.includes(k)))
    error("title", 0, "Unknown recipe field.");
  const text = (value: unknown, max: number, field: string, step: number) => {
    if (
      typeof value !== "string" ||
      Array.from(value).length > max ||
      value.includes("\u0000")
    )
      error(field, step, `Use plain text, up to ${max} characters.`);
  };
  for (const [key, max] of [
    ["title", 200],
    ["category", 40],
    ["origin", 100],
    ["yieldText", 200],
    ["story", 10000],
    ["sourceCredit", 1000],
    ["videoUrl", 2000],
    ["notes", 10000],
  ] as const)
    text(v[key], max, key, 0);
  if (typeof v.videoUrl === "string" && v.videoUrl && !safeWebUrl(v.videoUrl))
    error("videoUrl", 0, "Use a full http or https video link.");
  if (v.category && !categories.some((c) => c.id === v.category))
    error("category", 0, "Choose a category.");
  if (!["en", "es"].includes(v.language))
    error("language", 0, "Choose the original language.");
  if (
    typeof v.baselineConfirmed !== "boolean" ||
    (v.baseline !== null &&
      (typeof v.baseline !== "number" ||
        !Number.isFinite(v.baseline) ||
        v.baseline <= 0 ||
        v.baseline > 100000))
  )
    error("baseline", 0, "Enter a positive scaling baseline.");
  if (
    !Array.isArray(v.dietary) ||
    v.dietary.length > 2 ||
    v.dietary.some((d) => !["vegan", "vegetarian"].includes(d))
  )
    error("dietary", 0, "Choose the available dietary tags.");
  only(v.timing, ["mode", "total", "prep", "cook", "rest"], "timing", 0);
  if (!v.timing || !["total", "parts"].includes(v.timing.mode))
    error("timing", 0, "Choose a timing method.");
  else
    for (const k of ["total", "prep", "cook", "rest"] as const)
      if (
        v.timing[k] !== null &&
        (typeof v.timing[k] !== "number" ||
          !Number.isFinite(v.timing[k]) ||
          v.timing[k]! < 0 ||
          v.timing[k]! > 100000)
      )
        error(`timing.${k}`, 0, "Use nonnegative minutes up to 100,000.");
  if (!Array.isArray(v.photos) || v.photos.length > 6)
    error("photos", 1, "Use no more than 6 photos.");
  else {
    const ids = new Set<string>();
    v.photos.forEach((p, i) => {
      if (!p || !isId(p.assetId) || ids.has(p.assetId)) {
        error("photos", 1, "Choose distinct verified photos.");
        return;
      }
      ids.add(p.assetId);
      only(
        p,
        ["assetId", "caption", "alt", "crop", "width", "height"],
        "photos",
        1,
      );
      for (const dimension of [p.width, p.height])
        if (
          dimension !== undefined &&
          (!Number.isInteger(dimension) || dimension < 1 || dimension > 2400)
        )
          error("photos", 1, "Invalid photo dimensions.");
      only(p.crop, ["x", "y", "zoom"], "photos", 1);
      text(p.caption, 400, `photos.${i}.caption`, 1);
      text(p.alt, 400, `photos.${i}.alt`, 1);
      if (
        !p.crop ||
        ![p.crop.x, p.crop.y, p.crop.zoom].every(
          (n) => typeof n === "number" && Number.isFinite(n),
        ) ||
        p.crop.x < 0 ||
        p.crop.x > 100 ||
        p.crop.y < 0 ||
        p.crop.y > 100 ||
        p.crop.zoom < 1 ||
        p.crop.zoom > 3
      )
        error("photos", 1, "Check the cover crop.");
    });
  }
  if (!Array.isArray(v.ingredients) || v.ingredients.length > 100)
    error("ingredients", 2, "Use no more than 100 ingredient/section rows.");
  else
    v.ingredients.forEach((r, i) => {
      if (!r || !["ingredient", "section"].includes(r.kind)) {
        error("ingredients", 2, "Invalid ingredient row.");
        return;
      }
      only(r, ["kind", "quantity", "unit", "name", "notes"], "ingredients", 2);
      for (const k of ["quantity", "unit", "name", "notes"] as const)
        text(r[k], k === "notes" ? 1000 : 400, `ingredients.${i}.${k}`, 2);
    });
  if (!Array.isArray(v.instructions) || v.instructions.length > 50)
    error("instructions", 3, "Use no more than 50 instruction/section rows.");
  else
    v.instructions.forEach((r, i) => {
      if (!r || !["step", "section"].includes(r.kind)) {
        error("instructions", 3, "Invalid instruction row.");
        return;
      }
      only(r, ["kind", "text"], "instructions", 3);
      text(r.text, 10000, `instructions.${i}.text`, 3);
    });
  return errors;
}
export function validatePublication(value: unknown): FieldError[] {
  const errors = validateDraft(value);
  if (errors.length) return errors;
  const v = value as RecipeInput;
  const required = (
    valid: unknown,
    field: string,
    step: number,
    message: string,
  ) => {
    if (!valid) errors.push({ field, step, message });
  };
  required(v.title.trim(), "title", 0, "Add a title.");
  required(v.category, "category", 0, "Choose a category.");
  required(v.origin, "origin", 0, "Choose an origin.");
  required(v.yieldText.trim(), "yieldText", 0, "Add servings or yield.");
  required(
    v.baseline && v.baselineConfirmed,
    "baseline",
    0,
    "Confirm a numeric scaling baseline.",
  );
  required(
    (totalMinutes(v) ?? 0) > 0,
    "timing",
    0,
    "Add a total time or prep and cook times.",
  );
  required(v.photos.length >= 1, "photos", 1, "Add at least one photo.");
  v.photos.forEach((p, i) =>
    required(
      p.caption.trim(),
      `photos.${i}.caption`,
      1,
      "Add a descriptive caption.",
    ),
  );
  required(
    v.ingredients.some((r) => r.kind === "ingredient"),
    "ingredients",
    2,
    "Add an ingredient.",
  );
  v.ingredients.forEach((r, i) =>
    required(
      r.name.trim(),
      `ingredients.${i}.name`,
      2,
      "Name this ingredient or section.",
    ),
  );
  required(
    v.instructions.some((r) => r.kind === "step"),
    "instructions",
    3,
    "Add an instruction.",
  );
  v.instructions.forEach((r, i) =>
    required(
      r.text.trim(),
      `instructions.${i}.text`,
      3,
      "Write this step or section.",
    ),
  );
  return errors;
}

export function sameRecipe(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameRecipe(v, b[i]))
    );
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => Object.hasOwn(y, k) && sameRecipe(x[k], y[k]))
  );
}
