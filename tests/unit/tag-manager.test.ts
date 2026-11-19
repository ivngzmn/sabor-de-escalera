import { expect, test, vi } from 'vitest';
import { createConsentService } from '../../src/features/consent/service';
import { startTagManager } from '../../src/features/consent/tag-manager';

function storage() { const data = new Map<string, string>(); return { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear() } as Storage; }
function fakeWindow() {
  const scripts: { src: string; async: boolean }[] = []; const written: string[] = [];
  const reload = vi.fn();
  const document = {
    location: { hostname: 'www.example.com' },
    get cookie() { return '_ga=GA1.1; _ga_ABC=GS1; theme=dark'; },
    set cookie(value: string) { written.push(value); },
    createElement: () => ({ src: '', async: false }),
    head: { append: (script: { src: string; async: boolean }) => scripts.push(script) },
  };
  return { win: { document, location: { reload } } as unknown as Window & { dataLayer?: unknown[] }, scripts, written, reload };
}
const device = () => { const s = storage(); return () => s; };
const api = (service: ReturnType<typeof createConsentService>) => ({ readConsent: service.readConsent, subscribe: service.subscribe, registerCleanup: service.registerCleanup });

test('Tag Manager stays unloaded until analytics consent, then loads once', () => {
  const service = createConsentService(device()); const { win, scripts } = fakeWindow();
  startTagManager('GTM-5FWTF5RT', api(service), win);
  expect(scripts).toHaveLength(0); expect(win.dataLayer).toBeUndefined();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  service.updateConsent({ preferences: true, recovery: false, analytics: true });
  expect(scripts).toEqual([{ src: 'https://www.googletagmanager.com/gtm.js?id=GTM-5FWTF5RT', async: true }]);
  expect(win.dataLayer).toEqual([expect.objectContaining({ event: 'gtm.js' })]);
});

test('withdrawal clears Google cookies and reloads only after Tag Manager loaded', () => {
  const service = createConsentService(device()); const { win, written, reload } = fakeWindow();
  startTagManager('GTM-5FWTF5RT', api(service), win);
  service.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(reload).not.toHaveBeenCalled();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  service.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(reload).toHaveBeenCalledOnce();
  expect(written.some((c) => c.startsWith('_ga=;'))).toBe(true);
  expect(written.some((c) => c.startsWith('_ga_ABC=;') && c.includes('domain=.example.com'))).toBe(true);
  expect(written.some((c) => c.startsWith('theme='))).toBe(false);
});

test('an invalid container id never loads anything', () => {
  const service = createConsentService(device()); const { win, scripts } = fakeWindow();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  startTagManager('GTM-5FW"><script>', api(service), win);
  expect(scripts).toHaveLength(0);
});

test('a page without analytics consent clears leftover Google cookies without reloading', () => {
  const service = createConsentService(device()); const { win, written, reload } = fakeWindow();
  startTagManager('GTM-5FWTF5RT', api(service), win);
  expect(written.some((c) => c.startsWith('_ga=;'))).toBe(true);
  expect(reload).not.toHaveBeenCalled();
});
