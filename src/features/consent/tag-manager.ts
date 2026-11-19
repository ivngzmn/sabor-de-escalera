import type { Consent } from './service';

export const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;
const GOOGLE_COOKIE = /^(?:_ga(?:_.+)?|_gid|_gat(?:_.+)?|_gcl_.+)$/;

interface ConsentApi {
  readConsent(): Consent;
  subscribe(listener: () => void): () => void;
  registerCleanup(category: 'analytics', operation: () => void): () => void;
}
type DataLayerWindow = Window & { dataLayer?: unknown[] };

// Google Tag Manager loads only after a visitor opts in to Usage analytics.
// A loaded container cannot be unloaded, so withdrawal clears Google's cookies
// and reloads the page without it.
export function startTagManager(containerId: string, consent: ConsentApi, win: DataLayerWindow = window) {
  if (!GTM_ID_PATTERN.test(containerId)) return;
  const doc = win.document;
  let loaded = false;
  const load = () => {
    if (loaded || !consent.readConsent().analytics) return;
    loaded = true;
    win.dataLayer = win.dataLayer ?? [];
    win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = doc.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
    doc.head.append(script);
  };
  consent.registerCleanup('analytics', () => {
    if (!loaded) return;
    clearGoogleCookies(doc);
    win.location.reload();
  });
  consent.subscribe(load);
  load();
}

export function clearGoogleCookies(doc: Document) {
  const host = doc.location.hostname;
  const domains = ['', host, ...host.split('.').map((_, i, parts) => `.${parts.slice(i).join('.')}`).slice(0, -1)];
  for (const pair of doc.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim();
    if (!name || !GOOGLE_COOKIE.test(name)) continue;
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}
