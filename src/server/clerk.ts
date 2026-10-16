import { createClerkClient } from '@clerk/astro/server';
import type { AuthIdentity } from '../features/accounts/service';
import { AccountError } from '../features/accounts/permissions';
export function accountConfiguration(environment: Readonly<Record<string, string | undefined>> = { ...import.meta.env, ...process.env }) {
  const publishableKey = environment.PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = environment.CLERK_SECRET_KEY;
  const origin = environment.APP_ORIGIN;
  if (!publishableKey || !secretKey || !environment.DATABASE_URL || !origin || environment.CLERK_EMAIL_CODE_CONFIGURED !== 'true') return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) return null;
  } catch { return null; }
  return { publishableKey, secretKey, origin, ownerBootstrapEmail: environment.OWNER_BOOTSTRAP_EMAIL };
}
interface ClerkRequestState {
  status: string;
  headers: Headers;
  isAuthenticated: boolean;
  toAuth: () => { userId?: string | null };
}
interface ClerkProvider {
  authenticateRequest: (request: Request) => Promise<ClerkRequestState>;
  getUser: (subject: string) => Promise<{ id: string; primaryEmailAddressId: string | null; emailAddresses: { id: string; emailAddress: string; verification: { status: string } | null }[] }>;
}
export class ClerkResponseError extends Error {
  readonly response: Response;
  constructor(response: Response) { super('Clerk session synchronization required'); this.response = response; }
}
function synchronizationResponse(state: ClerkRequestState) {
  if (state.headers.has('Location')) {
    const response = new Response(null, { status: 307, headers: state.headers });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (state.status === 'handshake') throw new AccountError(503, 'Sign-in is temporarily unavailable');
  return null;
}
export function createClerkAdapter(provider: ClerkProvider) {
  // The request boundary and identity lookup share the same verified SDK state.
  const requests = new WeakMap<Request, Promise<ClerkRequestState>>();
  function authenticate(request: Request) {
    let pending = requests.get(request);
    if (!pending) {
      pending = provider.authenticateRequest(request).catch(() => { throw new AccountError(503, 'Sign-in is temporarily unavailable'); });
      requests.set(request, pending);
    }
    return pending;
  }
  return {
    async handleRequest(request: Request, next: () => Promise<Response>) {
      const state = await authenticate(request);
      const synchronization = synchronizationResponse(state);
      if (synchronization) return synchronization;
      const response = await next();
      // Headers.forEach combines Set-Cookie values. Preserve distinct cookies,
      // including Expires commas, when attaching ordinary SDK response headers.
      state.headers.forEach((value, key) => { if (key !== 'set-cookie') response.headers.append(key, value); });
      for (const cookie of state.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    },
    async verifyIdentity(request: Request): Promise<AuthIdentity | null> {
      const state = await authenticate(request);
      const synchronization = synchronizationResponse(state);
      if (synchronization) throw new ClerkResponseError(synchronization);
      if (!state.isAuthenticated) return null;
      const { userId } = state.toAuth();
      if (!userId) return null;
      try {
        const user = await provider.getUser(userId);
        const email = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
        if (!email || email.verification?.status !== 'verified') return null;
        return { provider: 'clerk', subject: user.id, email: email.emailAddress, emailVerified: true };
      } catch { throw new AccountError(503, 'Sign-in is temporarily unavailable'); }
    },
  };
}
let adapter: ReturnType<typeof createClerkAdapter> | undefined;
export function getClerkAdapter() {
  const config = accountConfiguration();
  if (!config) throw new AccountError(503, 'Sign-in is temporarily unavailable');
  if (!adapter) {
    const client = createClerkClient({ publishableKey: config.publishableKey, secretKey: config.secretKey });
    adapter = createClerkAdapter({
      async authenticateRequest(request) {
        const state = await client.authenticateRequest(request, { authorizedParties: [config.origin], acceptsToken: 'session_token' });
        return { status: state.status, headers: state.headers, isAuthenticated: state.isAuthenticated, toAuth: () => {
          const auth = state.toAuth();
          return { userId: auth && 'userId' in auth ? auth.userId : null };
        } };
      },
      getUser: (subject) => client.users.getUser(subject),
    });
  }
  return adapter;
}
export const verifyClerkIdentity = (request: Request): Promise<AuthIdentity | null> => getClerkAdapter().verifyIdentity(request);
