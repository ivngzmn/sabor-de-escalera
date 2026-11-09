import type { Origin } from "./validation";

/** The emoji flag for a two-letter country code, built from regional indicator letters; empty when there is none. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[a-z]{2}$/i.test(code)) return "";
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

/** An origin's name in the reader's language, with its country flag in front when it is a country. */
export function originLabel(origin: Origin, language: "en" | "es"): string {
  const name = language === "es" ? origin.label_es : origin.label_en;
  const flag = flagEmoji(origin.country_code);
  return flag ? `${flag} ${name}` : name;
}
