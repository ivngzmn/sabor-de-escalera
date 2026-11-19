import { expect, test, vi } from 'vitest';
import type { PostHog } from 'posthog-js';
import { createConsentService } from '../../src/features/consent/service';
import { startPostHog } from '../../src/features/consent/posthog';

function storage() { const data = new Map<string, string>(); return { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear() } as Storage; }
const device = () => { const s = storage(); return () => s; };
const api = (service: ReturnType<typeof createConsentService>) => ({ readConsent: service.readConsent, subscribe: service.subscribe, registerCleanup: service.registerCleanup });
const settings = { token: 'phc_abc', host: 'https://us.i.posthog.com', person: { id: 'member-1', role: 'member', onboarded: true } };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeWindow() {
  const local = storage(); local.setItem('ph_phc_abc_posthog', '{}'); local.setItem('escalera:consent', 'kept by service');
  const written: string[] = [];
  const win = {
    location: { hostname: 'www.example.com', reload: vi.fn() },
    localStorage: local, sessionStorage: storage(),
    document: { location: { hostname: 'www.example.com' }, get cookie() { return 'ph_phc_abc_posthog=1; theme=dark'; }, set cookie(v: string) { written.push(v); } },
  } as unknown as Window & { posthog?: PostHog };
  const sdk = { init: vi.fn(), identify: vi.fn(), opt_out_capturing: vi.fn(), reset: vi.fn(), set_config: vi.fn() };
  return { win, local, written, sdk, load: vi.fn(async () => sdk as unknown as PostHog) };
}

test('PostHog is not downloaded or initialised until analytics consent', async () => {
  const service = createConsentService(device()); const { win, sdk, load } = fakeWindow();
  startPostHog(settings, api(service), win, load);
  await flush();
  expect(load).not.toHaveBeenCalled(); expect(win.posthog).toBeUndefined();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  await flush();
  expect(sdk.init).toHaveBeenCalledOnce();
  expect(sdk.init.mock.calls[0]![0]).toBe('phc_abc');
  expect(sdk.init.mock.calls[0]![1]).toMatchObject({ session_recording: { maskAllInputs: true } });
  expect(sdk.identify).toHaveBeenCalledWith('member-1', { role: 'member', onboarded: true });
  expect(win.posthog).toBe(sdk);
});

test('withdrawal stops capture, clears PostHog storage only and reloads', async () => {
  const service = createConsentService(device()); const { win, local, written, sdk, load } = fakeWindow();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  startPostHog(settings, api(service), win, load);
  await flush();
  service.updateConsent({ preferences: false, recovery: false, analytics: false });
  expect(sdk.opt_out_capturing).toHaveBeenCalled(); expect(sdk.reset).toHaveBeenCalled(); expect(sdk.set_config).toHaveBeenCalledWith({ disable_persistence: true });
  expect(win.posthog).toBeUndefined();
  expect(local.getItem('ph_phc_abc_posthog')).toBeNull(); expect(local.getItem('escalera:consent')).toBe('kept by service');
  expect(written.some((c) => c.startsWith('ph_phc_abc_posthog=;'))).toBe(true); expect(written.some((c) => c.startsWith('theme='))).toBe(false);
  expect(win.location.reload).toHaveBeenCalledOnce();
});

test('a withdrawal during the SDK download never initialises PostHog', async () => {
  const service = createConsentService(device()); const { win, sdk, load } = fakeWindow();
  service.updateConsent({ preferences: false, recovery: false, analytics: true });
  startPostHog(settings, api(service), win, load);
  service.updateConsent({ preferences: false, recovery: false, analytics: false });
  await flush();
  expect(sdk.init).not.toHaveBeenCalled(); expect(win.posthog).toBeUndefined();
});

test('a page without analytics consent clears leftover PostHog storage without loading or reloading', async () => {
  const service = createConsentService(device()); const { win, local, load } = fakeWindow();
  startPostHog(settings, api(service), win, load);
  await flush();
  expect(local.getItem('ph_phc_abc_posthog')).toBeNull();
  expect(load).not.toHaveBeenCalled(); expect(win.location.reload).not.toHaveBeenCalled();
});
