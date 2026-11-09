import { accounts, type Actor } from '../../../features/accounts/service';
import { AccountError, signInHref } from '../../../features/accounts/permissions';
import { accountFailure } from '../../../features/accounts/routes';
import { accountConfiguration, ClerkResponseError } from '../../../server/clerk';

/** Admin pages: an admin actor, or the response to send instead (sign-in redirect or access failure). */
export async function adminOrResponse(request: Request, url: URL): Promise<Actor | Response> {
  try { return await accounts().requireAdmin(request); }
  catch (error) {
    if (error instanceof ClerkResponseError) return error.response;
    if (error instanceof AccountError && error.status === 401)
      // Not Response.redirect(): its headers are immutable, and Astro adds headers to whatever a page returns.
      return new Response(null, { status: 303, headers: { Location: signInHref(url.pathname, accountConfiguration()?.origin ?? url.origin, true) } });
    return accountFailure(error);
  }
}
