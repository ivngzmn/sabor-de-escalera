import type { PostHog } from 'posthog-js';
import type { Consent } from './service';

export interface PostHogSettings { token: string; host: string; person: { id: string; role: string; onboarded: boolean } | null; }
interface ConsentApi {
  readConsent(): Consent;
  subscribe(listener: () => void): () => void;
  registerCleanup(category: 'analytics', operation: () => void): () => void;
}
type PostHogWindow = Window & { posthog?: PostHog };
const loadSdk = async () => (await import('posthog-js')).default;

// PostHog loads only after a visitor opts in to Usage analytics, and its SDK is a
// separate chunk the browser never downloads without that consent. Withdrawal
// stops capture, removes PostHog's device storage and reloads without the SDK.
export function startPostHog(settings: PostHogSettings, consent: ConsentApi, win: PostHogWindow = window, load: () => Promise<PostHog> = loadSdk) {
  let started = false;
  let client: PostHog | null = null;
  const start = () => {
    if (started || !consent.readConsent().analytics) return;
    started = true;
    void load().then((posthog) => {
      // Consent may have been withdrawn while the SDK chunk downloaded.
      if (!consent.readConsent().analytics) return;
      posthog.init(settings.token, {
        api_host: settings.host,
        defaults: '2025-05-24',
        person_profiles: 'identified_only',
        tracing_headers: [win.location.hostname],
        capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
      });
      if (settings.person) posthog.identify(settings.person.id, { role: settings.person.role, onboarded: settings.person.onboarded });
      client = posthog;
      win.posthog = posthog;
    }).catch(() => { started = false; });
  };
  // Runs at once on every page without consent too, clearing anything written
  // while a withdrawing page unloaded.
  consent.registerCleanup('analytics', () => {
    if (started) {
      // Disable persistence last so PostHog cannot rewrite its cookie while the page unloads.
      try { client?.opt_out_capturing(); client?.reset(); client?.set_config({ disable_persistence: true }); } catch { /* Storage is cleared below regardless. */ }
      delete win.posthog;
    }
    clearPostHogStorage(win);
    if (started) win.location.reload();
  });
  consent.subscribe(start);
  start();
}

export function clearPostHogStorage(win: Window) {
  for (const storage of [() => win.localStorage, () => win.sessionStorage]) {
    try {
      const store = storage(); const owned: string[] = [];
      for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key?.startsWith('ph_') || key?.startsWith('__ph_')) owned.push(key); }
      for (const key of owned) store.removeItem(key);
    } catch { /* Storage can be unavailable. */ }
  }
  const doc = win.document;
  const host = doc.location.hostname;
  const domains = ['', host, ...host.split('.').map((_, i, parts) => `.${parts.slice(i).join('.')}`).slice(0, -1)];
  for (const pair of doc.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim();
    if (!name?.startsWith('ph_')) continue;
    for (const domain of domains) doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
  }
}
