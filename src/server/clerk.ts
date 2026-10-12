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
export async function verifyClerkIdentity(request: Request): Promise<AuthIdentity | null> {
  const config = accountConfiguration();
  if (!config) throw new AccountError(503, 'Sign-in is temporarily unavailable');
  try {
    const client = createClerkClient({ publishableKey: config.publishableKey, secretKey: config.secretKey });
    const state = await client.authenticateRequest(request, { authorizedParties: [config.origin], acceptsToken: 'session_token' });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    if (!auth.userId) return null;
    const user = await client.users.getUser(auth.userId);
    const email = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
    if (!email || email.verification?.status !== 'verified') return null;
    return { provider: 'clerk', subject: user.id, email: email.emailAddress, emailVerified: true };
  } catch (error) {
    if (error instanceof AccountError) throw error;
    // Do not expose SDK errors, tokens or private email in responses or logs.
    throw new AccountError(503, 'Sign-in is temporarily unavailable');
  }
}
