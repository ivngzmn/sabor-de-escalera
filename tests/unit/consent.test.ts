import { expect, test } from 'vitest';
import { createConsentService } from '../../src/features/consent/service';

function storage() { const data = new Map<string, string>(); return { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear() }; }
test('defaults and corrupt or old decisions fail closed without persisting optional data', () => {
  const device = storage(); const service = createConsentService(() => device);
  expect(service.readConsent()).toMatchObject({ preferences: false, recovery: false, analytics: false }); expect(device.length).toBe(0);
  for (const invalid of ['not-json', '{"version":0,"preferences":true}', '{"version":1,"preferences":"false","recovery":true,"analytics":true,"updatedAt":"2026-10-12"}']) { device.setItem('escalera:consent', invalid); expect(service.readConsent().analytics).toBe(false); }
});
test('withdrawal revokes capture before cleanup, clears owned keys only and isolates cleanup failures', () => {
  const device = storage(); const session = storage(); const service = createConsentService(() => device, () => session);
  service.updateConsent({ preferences: true, recovery: true, analytics: true });
  let stopped = false; let checked = false;
  service.registerCleanup('analytics', () => { stopped = true; checked = !service.readConsent().analytics; throw new Error('SDK cleanup failed'); });
  let recoveryCleared = false; service.registerCleanup('recovery', () => { recoveryCleared = true; });
  for (const s of [device, session]) { s.setItem('escalera:preferences:language', 'es'); s.setItem('escalera:recovery:member:draft', 'text'); s.setItem('escalera:analytics:session', 'opaque'); s.setItem('__clerk', 'essential'); s.setItem('other-app', 'keep'); }
  service.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(stopped && checked && recoveryCleared).toBe(true);
  for (const s of [device, session]) { expect(s.getItem('__clerk')).toBe('essential'); expect(s.getItem('other-app')).toBe('keep'); expect(s.getItem('escalera:recovery:member:draft')).toBeNull(); expect(s.getItem('escalera:preferences:language')).toBeNull(); expect(s.getItem('escalera:analytics:session')).toBeNull(); }
});
test('storage denial retains in-memory withdrawal and cleanup', () => {
  const service = createConsentService(() => { throw new Error('blocked'); }); let cleared = false;
  service.updateConsent({ preferences: true, recovery: true, analytics: true }); service.registerCleanup('analytics', () => { cleared = true; });
  service.updateConsent({ preferences: false, recovery: false, analytics: false }); expect(service.readConsent().analytics).toBe(false); expect(cleared).toBe(true);
});
test('a quota failure during withdrawal never restores a stored grant', () => {
  const device = storage(); let writesBlocked = false;
  const guarded: Storage = { ...device, setItem: (key, value) => { if (writesBlocked) throw new Error('quota'); device.setItem(key, value); } };
  const service = createConsentService(() => guarded);
  service.updateConsent({ preferences: true, recovery: true, analytics: true });
  let revoked = false; service.registerCleanup('analytics', () => { revoked = !service.readConsent().analytics; });
  writesBlocked = true; service.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(revoked).toBe(true); expect(service.readConsent().analytics).toBe(false);
});

test('cross-tab withdrawal revokes every memory-only grant and cleans the receiving tab despite a cleanup error', () => {
  const shared = storage(); const tabSession = storage();
  const failingGrant: Storage = { ...shared, setItem: () => { throw new Error('quota'); } };
  const tabA = createConsentService(() => failingGrant, () => tabSession);
  const tabB = createConsentService(() => shared);
  tabA.updateConsent({ preferences: true, recovery: true, analytics: true });
  expect(tabA.readConsent()).toMatchObject({ preferences: true, recovery: true, analytics: true });
  const stopped: string[] = [];
  for (const category of ['preferences', 'recovery', 'analytics'] as const) {
    tabSession.setItem(`escalera:${category}:fixture`, 'optional');
    tabA.registerCleanup(category, () => { expect(tabA.readConsent()[category]).toBe(false); stopped.push(category); if (category === 'preferences') throw new Error('SDK cleanup failed'); });
  }
  tabSession.setItem('essential', 'retain');
  tabB.updateConsent({ preferences: false, recovery: false, analytics: false });
  tabA.synchronize();
  expect(tabA.readConsent()).toMatchObject({ preferences: false, recovery: false, analytics: false });
  expect(stopped).toEqual(['preferences', 'recovery', 'analytics']);
  for (const category of ['preferences', 'recovery', 'analytics']) expect(tabSession.getItem(`escalera:${category}:fixture`)).toBeNull();
  expect(tabSession.getItem('essential')).toBe('retain');
});

test('synchronization never restores stale stored grants after a local withdrawal cannot write or remove', () => {
  const shared = storage(); let blocked = false;
  const guarded: Storage = { ...shared, setItem: (key, value) => { if (blocked) throw new Error('quota'); shared.setItem(key, value); }, removeItem: (key) => { if (blocked) throw new Error('blocked'); shared.removeItem(key); } };
  const tabA = createConsentService(() => guarded);
  tabA.updateConsent({ preferences: true, recovery: true, analytics: true });
  blocked = true;
  tabA.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(JSON.parse(shared.getItem('escalera:consent')!)).toMatchObject({ preferences: true, recovery: true, analytics: true });
  tabA.synchronize();
  expect(tabA.readConsent()).toMatchObject({ preferences: false, recovery: false, analytics: false });
});
