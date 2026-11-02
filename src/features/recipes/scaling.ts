// Scales author quantity text only. Units, names, notes, times and temperatures are never passed here.
const unicode: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
const glyphs = Object.entries(unicode);
const glyphClass = Object.keys(unicode).join("");
type Style = "unicode" | "ascii" | "decimal";
const NUMBER = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*[${glyphClass}]|\\d+(?:[.,]\\d+)?)`;
const SINGLE = new RegExp(`^(${NUMBER})$`);
const RANGE = new RegExp(`^(${NUMBER})(\\s*[-–]\\s*|\\s+(?:to|a)\\s+)(${NUMBER})$`);

function parse(token: string): { value: number; style: Style } | null {
  let m = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[3]) ? { value: Number(m[1]) + Number(m[2]) / Number(m[3]), style: "ascii" } : null;
  m = token.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) ? { value: Number(m[1]) / Number(m[2]), style: "ascii" } : null;
  m = token.match(new RegExp(`^(\\d*)([${glyphClass}])$`));
  if (m) return { value: Number(m[1] || 0) + unicode[m[2]], style: "unicode" };
  m = token.match(/^\d+(?:[.,]\d+)?$/);
  if (m) return { value: Number(token.replace(",", ".")), style: token.match(/[.,]/) ? "decimal" : "unicode" };
  return null;
}

function format(value: number, style: Style): string {
  if (style !== "decimal") {
    const whole = Math.floor(value + 1e-9);
    const rest = value - whole;
    if (rest < 0.01) return String(whole);
    for (const d of [2, 3, 4, 8]) {
      const n = Math.round(rest * d);
      if (n > 0 && n < d && Math.abs(rest - n / d) < 0.01) {
        if (style === "ascii") return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
        const glyph = glyphs.find(([, v]) => Math.abs(v - n / d) < 1e-9)?.[0];
        if (glyph) return whole ? `${whole}${glyph}` : glyph;
      }
    }
  }
  return String(Math.round(value * 100) / 100);
}

/** Scales plain numbers, fractions, mixed numbers and ranges; anything else is returned unchanged. */
export function scaleQuantity(quantity: string, factor: number): { text: string; scaled: boolean } {
  const text = quantity.trim();
  if (!text || factor === 1 || !Number.isFinite(factor) || factor <= 0) return { text: quantity, scaled: false };
  const range = text.match(RANGE);
  if (range) {
    const [a, b] = [parse(range[1]), parse(range[3])];
    if (!a || !b) return { text: quantity, scaled: false };
    return { text: `${format(a.value * factor, a.style)}${range[2]}${format(b.value * factor, b.style)}`, scaled: true };
  }
  if (!SINGLE.test(text)) return { text: quantity, scaled: false };
  const n = parse(text);
  return n ? { text: format(n.value * factor, n.style), scaled: true } : { text: quantity, scaled: false };
}

export const clampServings = (n: number) => (Number.isFinite(n) ? Math.min(99, Math.max(1, Math.round(n))) : 1);
