import { describe, expect, it } from "vitest";
import {
  CLEARANCE,
  ORIGINS,
  clearanceFor,
  fillInput,
  highMinutes,
  lowServings,
} from "../../scripts/cookbook-publish-values.ts";
import { emptyRecipe } from "../../src/features/recipes/validation";

const ALLOWED = new Set(
  "argentina bolivia brazil chile colombia costa-rica cuba dominican-republic ecuador el-salvador fusion guatemala haiti honduras mexico nicaragua not-sure panama paraguay peru puerto-rico uruguay venezuela".split(
    " ",
  ),
);

describe("lowServings", () => {
  it("reads the low end of a range or a single number", () => {
    expect(lowServings("Serves 3-4 people")).toBe(3);
    expect(lowServings("Serves 12 people")).toBe(12);
    expect(lowServings("")).toBeNull();
  });
});

describe("highMinutes", () => {
  it("reads the printed time", () => {
    expect(highMinutes("Printed time: Prep + Cook 25-30 minutes.")).toBe(30);
    expect(highMinutes("Printed time: Preparation 20 minutes.")).toBe(20);
    expect(
      highMinutes("Printed time: Preparation 45 minutes (peaches soak overnight first)."),
    ).toBe(45);
    expect(highMinutes("Texas Salsa 2022 Contest winner.")).toBeNull();
  });
});

describe("ORIGINS", () => {
  it("covers all 40 drafts with allowed origin ids", () => {
    const entries = Object.entries(ORIGINS);
    expect(entries).toHaveLength(40);
    for (const [key, origin] of entries) {
      expect(ALLOWED.has(origin), `${key}: ${origin}`).toBe(true);
    }
  });
});

describe("fillInput", () => {
  const base = () => ({
    ...emptyRecipe(),
    yieldText: "Serves 3-4 people",
    notes: "Printed time: Prep + Cook 25-30 minutes.",
  });

  it("fills origin, baseline and total without mutating the argument", () => {
    const input = base();
    const snapshot = JSON.parse(JSON.stringify(input));
    const { input: out, missing } = fillInput("p08-chimichurri-sauce", input);
    expect(input).toEqual(snapshot);
    expect(out.origin).toBe("argentina");
    expect(out.baseline).toBe(3);
    expect(out.baselineConfirmed).toBe(true);
    expect(out.timing.total).toBe(30);
    expect(missing).toEqual([]);
  });

  it("keeps an existing origin and total", () => {
    const input = base();
    input.origin = "peru";
    input.timing = { ...input.timing, total: 15 };
    const { input: out } = fillInput("p08-chimichurri-sauce", input);
    expect(out.origin).toBe("peru");
    expect(out.timing.total).toBe(15);
  });

  it("leaves parts timing alone", () => {
    const input = base();
    input.timing = { mode: "parts", total: null, prep: 10, cook: 20, rest: null };
    const { input: out, missing } = fillInput("p08-chimichurri-sauce", input);
    expect(out.timing).toEqual(input.timing);
    expect(missing).not.toContain("timing");
  });

  it("reports what it could not fill", () => {
    const { input: out, missing } = fillInput("p03-brendas-tomatillo-salsa", {
      ...emptyRecipe(),
      baseline: 7,
    });
    expect(out.baseline).toBe(7);
    expect(missing).toEqual(["yieldText", "baseline", "timing"]);
  });
});

describe("clearanceFor", () => {
  it("returns null with no source urls or an unknown host", () => {
    expect(clearanceFor([])).toBeNull();
    expect(clearanceFor(["https://unknown.example/x"])).toBeNull();
  });

  it("matches hosts without www and needs every host covered", () => {
    CLEARANCE["tasty.co"] = "note";
    try {
      expect(clearanceFor(["https://www.tasty.co/x"])).toBe("note");
      expect(clearanceFor(["https://www.tasty.co/x", "https://unknown.example/y"])).toBeNull();
    } finally {
      delete CLEARANCE["tasty.co"];
    }
  });
});
