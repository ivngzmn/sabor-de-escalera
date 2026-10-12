import { accountConfiguration } from '../../server/clerk';
import { accounts, type createAccountService } from './service';
import { AccountError, assertSameOriginWrite } from './permissions';
export const privateHeaders = { 'Cache-Control': 'private, no-store' };
export function accountFailure(error: unknown) {
  const status = error instanceof AccountError ? error.status : 503;
  return new Response(status === 400 ? 'Check the submitted account details.' : status === 401 ? 'Sign-in required.' : status === 403 ? 'Access denied.' : 'Account service is temporarily unavailable.', { status, headers: privateHeaders });
}
export async function handleAdminWrite(request: Request, service?: ReturnType<typeof createAccountService>, origin = accountConfiguration()?.origin ?? new URL(request.url).origin) {
  try {
    assertSameOriginWrite(request, origin);
    const accountService = service ?? accounts();
    const form = await request.formData();
    const action = form.get('action');
    if (action === 'invite') await accountService.inviteAdmin(request, form.get('email'));
    else if (action === 'remove' || action === 'revoke') {
      const target = form.get('target');
      if (typeof target !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(target)) throw new AccountError(400, 'Invalid target');
      if (action === 'remove') await accountService.removeAdmin(request, target);
      else await accountService.revokeInvitation(request, target);
    } else throw new AccountError(400, 'Invalid admin action');
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: form.get('lang') === 'es' ? '/admin?lang=es' : '/admin' } });
  } catch (error) { return accountFailure(error); }
}
