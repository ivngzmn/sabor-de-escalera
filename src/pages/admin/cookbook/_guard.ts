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
      return Response.redirect(new URL(signInHref(url.pathname, accountConfiguration()?.origin ?? url.origin, true), url), 303);
    return accountFailure(error);
  }
}
