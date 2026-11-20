import type { RecipeInput } from '../src/features/recipes/validation.ts';

// Rules and per-recipe values for publishing the staged cookbook drafts. Pure: no I/O.

/** Origin per import key, from the owner's origins table. */
export const ORIGINS: Record<string, string> = {
  'p03-brendas-tomatillo-salsa': 'el-salvador',
  'p04-red-beans-caribbean-style': 'not-sure',
  'p05-sopita-de-fideo': 'mexico',
  'p06-sopa-paraguaya': 'paraguay',
  'p07-salsa-de-chile': 'mexico',
  'p08-chimichurri-sauce': 'argentina',
  'p09-fried-green-plantains-bannann-peze': 'haiti',
  'p10-tortitas-de-atun': 'mexico',
  'p11-llapingachos': 'ecuador',
  'p12-pholourie': 'not-sure',
  'p13-brazilian-lemonade': 'brazil',
  'p14-coquito': 'puerto-rico',
  'p15-mote-con-huesillos': 'chile',
  'p16-papelon-con-limon': 'venezuela',
  'p17-pupusas': 'el-salvador',
  'p18-green-chili-enchilada-casserole': 'mexico',
  'p19-argentine-campo-arroz-con-pollo': 'argentina',
  'p20-tinga-de-pollo': 'mexico',
  'p21-shrimp-kreyol': 'haiti',
  'p22-chicken-chile-colorado': 'mexico',
  'p23-haitian-stewed-chicken-poule-en-sauce': 'haiti',
  'p24-caldo-de-albondigas': 'mexico',
  'p25-mondongo-a-la-criolla': 'not-sure',
  'p26-el-mole-de-mi-mama': 'mexico',
  'p27-gallo-pinto': 'nicaragua',
  'p28-lauras-buffalo-chicken-enchiladas': 'fusion',
  'p29-lomo-saltado': 'peru',
  'p30-mofongo-con-camarones': 'puerto-rico',
  'p31-arroz-con-pollo': 'not-sure',
  'p32-huevos-rancheros': 'mexico',
  'p33-pique-a-lo-macho': 'bolivia',
  'p34-pom': 'not-sure',
  'p35-belizean-garnaches': 'not-sure',
  'p36-gambas-al-ajillo': 'not-sure',
  'p37-hilachas': 'guatemala',
  'p38-macheteadas': 'honduras',
  'p39-flan-de-queso': 'cuba',
  'p40-alfajores': 'not-sure',
  'p41-costa-rican-arroz-con-leche': 'costa-rica',
  'p42-postre-de-natas': 'colombia',
};

/** Clearance notes keyed by hostname without "www.". The owner supplies these verbatim. */
export const CLEARANCE: Record<string, string> = {};

/** Per-recipe values for what the book never printed. An override wins over the generic rules. */
export const OVERRIDES: Record<string, { yieldText?: string; baseline?: number; total?: number }> = {};

/** The low end of a yield such as "Serves 3-4 people", or null when it has no number. */
export function lowServings(yieldText: string): number | null {
  const match = /\d+(?:\.\d+)?/.exec(yieldText);
  return match ? Number(match[0]) : null;
}

/** The high end of a printed time, such as "Printed time: Prep + Cook 25-30 minutes", or null. */
export function highMinutes(notes: string): number | null {
  const match = /(\d+)(?:\s*[-–]\s*(\d+))?\s*minutes?/i.exec(notes);
  if (!match) return null;
  return Number(match[2] ?? match[1]);
}

/** Fills origin, baseline and total time. Returns a copy and the fields it could not fill. */
export function fillInput(key: string, input: RecipeInput): { input: RecipeInput; missing: string[] } {
  const out: RecipeInput = { ...input, timing: { ...input.timing } };
  const missing: string[] = [];

  if (!out.origin && ORIGINS[key]) out.origin = ORIGINS[key];

  const override = OVERRIDES[key];
  if (override?.yieldText !== undefined) out.yieldText = override.yieldText;

  const servings = override?.baseline ?? lowServings(out.yieldText);
  if (!out.yieldText.trim()) missing.push('yieldText');
  if (servings === null) {
    missing.push('baseline');
  } else {
    out.baseline = servings;
    out.baselineConfirmed = true;
  }

  const t = out.timing;
  const hasParts = t.mode === 'parts' && (t.prep !== null || t.cook !== null);
  if (!hasParts && override?.total !== undefined) {
    t.total = override.total;
  } else if (!hasParts && t.total === null) {
    const total = highMinutes(out.notes);
    if (total === null) missing.push('timing');
    else t.total = total;
  }

  return { input: out, missing };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The clearance note when every source host has one, otherwise null. */
export function clearanceFor(sourceUrls: string[]): string | null {
  if (sourceUrls.length === 0) return null;
  const notes: string[] = [];
  for (const url of sourceUrls) {
    const host = hostOf(url);
    const note = host ? CLEARANCE[host] : undefined;
    if (!note) return null;
    if (!notes.includes(note)) notes.push(note);
  }
  return notes.join(' ');
}

export type ClearancePlan = { action: 'none' } | { action: 'done' } | { action: 'write'; note: string } | { action: 'missing' };

/** What source clearance still needs doing: nothing, already done, write this note, or a note is missing. */
export function clearancePlan(needsClearance: boolean, existing: string | null, sourceUrls: string[]): ClearancePlan {
  if (!needsClearance) return { action: 'none' };
  if (existing) return { action: 'done' };
  const note = clearanceFor(sourceUrls);
  return note ? { action: 'write', note } : { action: 'missing' };
}
