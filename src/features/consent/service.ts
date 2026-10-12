export interface Consent { version: number; preferences: boolean; recovery: boolean; analytics: boolean; updatedAt: string; }
export type OptionalCategory = 'preferences' | 'recovery' | 'analytics';
export type ConsentChoices = Pick<Consent, OptionalCategory>;
const key = 'escalera:consent';
const categories: OptionalCategory[] = ['preferences', 'recovery', 'analytics'];
const defaults = (): Consent => ({ version: 1, preferences: false, recovery: false, analytics: false, updatedAt: '' });
function parse(value: string | null): Consent {
  try {
    const record = JSON.parse(value ?? 'null');
    if (record?.version !== 1 || categories.some((category) => typeof record[category] !== 'boolean') || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return defaults();
    return { version: 1, preferences: record.preferences, recovery: record.recovery, analytics: record.analytics, updatedAt: record.updatedAt };
  } catch { return defaults(); }
}

// Owned prefixes are the only optional storage contract. Never clear Clerk/session
// storage or server drafts. Account autosave has no dependency on this module.
export function createConsentService(local: () => Storage, session?: () => Storage) {
  let memory = defaults();
  let memoryOnly = false;
  const cleanups = new Map<OptionalCategory, Set<() => void>>(categories.map((category) => [category, new Set()]));
  const listeners = new Set<() => void>();
  function readConsent(): Consent {
    try { if (!memoryOnly) memory = parse(local().getItem(key)); } catch { /* Privacy mode: use the current in-memory decision. */ }
    return { ...memory };
  }
  function cleanup(consent: Consent) {
    for (const category of categories.filter((category) => !consent[category])) {
      // Stop capture before touching SDK/device state; callback failures cannot
      // prevent other categories from withdrawing.
      for (const stop of cleanups.get(category)!) { try { stop(); } catch { /* Remains revoked. */ } }
      for (const getStorage of [local, session]) {
        if (!getStorage) continue;
        try {
          const storage = getStorage(); const owned: string[] = [];
          for (let i = 0; i < storage.length; i++) { const entry = storage.key(i); if (entry?.startsWith(`escalera:${category}:`)) owned.push(entry); }
          for (const entry of owned) storage.removeItem(entry);
        } catch { /* Optional storage can be unavailable. */ }
      }
    }
  }
  function updateConsent(next: ConsentChoices): void {
    memory = { version: 1, preferences: next.preferences === true, recovery: next.recovery === true, analytics: next.analytics === true, updatedAt: new Date().toISOString() };
    try { local().setItem(key, JSON.stringify(memory)); memoryOnly = false; } catch { memoryOnly = true; try { local().removeItem(key); } catch { /* Storage unavailable. */ } /* Choice lasts for this page. */ }
    cleanup(memory);
    for (const listener of listeners) listener();
  }
  function synchronize() { cleanup(readConsent()); for (const listener of listeners) listener(); }
  return {
    readConsent, updateConsent, synchronize,
    registerCleanup(category: OptionalCategory, operation: () => void) {
      cleanups.get(category)!.add(operation);
      if (!readConsent()[category]) { try { operation(); } catch { /* No optional permission. */ } }
      return () => { cleanups.get(category)!.delete(operation); };
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
const device = createConsentService(() => window.localStorage, () => window.sessionStorage);
export const readConsent = device.readConsent;
export const updateConsent = device.updateConsent;
export const registerConsentCleanup = device.registerCleanup;
export const subscribeConsent = device.subscribe;
export const synchronizeConsent = device.synchronize;
