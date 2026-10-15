import { validateDraft, type RecipeInput } from "./validation";
export interface Recovery {
  id: string;
  version: number;
  generation: number;
  input: RecipeInput;
}
const prefix = (account: string) =>
  `escalera:recovery:${encodeURIComponent(account)}:`;
export function clearAccountRecovery(storage: Storage, account: string) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(prefix(account))) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* Optional storage unavailable. */
  }
}
export function forgetRecovery(storage: Storage, account: string, id: string) {
  try {
    storage.removeItem(prefix(account) + id);
  } catch {
    /* Optional storage unavailable. */
  }
}
export function writeRecovery(
  storage: Storage,
  consented: boolean,
  account: string,
  record: Recovery,
) {
  if (!consented) return;
  try {
    if (validateDraft(record.input).length) return;
    storage.setItem(
      prefix(account) + record.id,
      JSON.stringify({
        id: record.id,
        version: record.version,
        generation: record.generation,
        input: record.input,
      }),
    );
  } catch {
    /* Server autosave remains independent. */
  }
}
export function readRecovery(
  storage: Storage,
  consented: boolean,
  account: string,
  current: { id: string; generation: number },
): Recovery | null {
  if (!consented) return null;
  try {
    const r = JSON.parse(
      storage.getItem(prefix(account) + current.id) ?? "null",
    );
    if (
      !r ||
      r.id !== current.id ||
      r.generation !== current.generation ||
      !Number.isSafeInteger(r.version) ||
      validateDraft(r.input).length
    ) {
      forgetRecovery(storage, account, current.id);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}
