import type { PhotoCredit } from "./catalog";

const copy = {
  en: { by: "Photo by", on: "on", illustrative: "Illustrative photo", ai: "AI-generated illustrative image" },
  es: { by: "Foto de", on: "en", illustrative: "Foto ilustrativa", ai: "Imagen ilustrativa generada por IA" },
};

/** Reader-facing credit line (spec 16): “Photo by … on …”, with the illustrative label for stock and AI images. */
export function photoCreditText(credit: PhotoCredit | undefined, language: "en" | "es"): string {
  if (!credit) return "";
  const t = copy[language];
  if (credit.label === "ai-illustrative") return t.ai;
  const byline = credit.photographer ? `${t.by} ${credit.photographer}${credit.site ? ` ${t.on} ${credit.site}` : ""}` : "";
  return [credit.label === "illustrative" ? t.illustrative : "", byline].filter(Boolean).join(" · ");
}
