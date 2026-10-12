export interface Actor {
  id: string;
  role: 'member' | 'admin' | 'owner';
  suspended: boolean;
  onboarded: boolean;
  displayName: string | null;
  bio: string;
  avatarAssetId?: string | null;
  avatarPreset: 'chile' | 'corn' | 'lime' | null;
  savedListPublic: boolean;
}
export class AccountError extends Error {
  readonly status: 400 | 401 | 403 | 503;
  constructor(status: 400 | 401 | 403 | 503, message: string) { super(message); this.status = status; }
}
export function canContribute(actor: Actor): boolean { return actor.onboarded && !actor.suspended; }
export function assertAdmin(actor: Actor) {
  if (!['admin', 'owner'].includes(actor.role)) throw new AccountError(403, 'Admin access required');
}
export function assertOwner(actor: Actor) {
  if (actor.role !== 'owner') throw new AccountError(403, 'Owner access required');
}
export function assertSameOriginWrite(request: Request, origin: string) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new AccountError(403, 'Same-origin write required');
  }
}
const unsafeCharacters = (value: string) => Array.from(value).some((character) => [92, 127].includes(character.charCodeAt(0)) || character.charCodeAt(0) <= 32);
export function safeReturnTo(value: string | null | undefined, origin: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || unsafeCharacters(value)) return '/';
  try {
    const url = new URL(value, origin);
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== origin || path.startsWith('//') || unsafeCharacters(path) || /^\/(sign-in|onboarding)(?:\/|$)/.test(path)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}
export function signInHref(returnTo: string, origin: string, admin = false) {
  const target = safeReturnTo(returnTo, origin);
  const query = new URLSearchParams({ returnTo: target });
  if (new URL(target, origin).searchParams.get('lang') === 'es') query.set('lang', 'es');
  return `${admin ? '/admin' : '/sign-in'}?${query}`;
}
