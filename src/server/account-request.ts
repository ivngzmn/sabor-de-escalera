import { accountConfiguration, getClerkAdapter, type createClerkAdapter } from './clerk';
import { accountFailure } from '../features/accounts/routes';
export async function handleAccountRequest(request: Request, next: () => Promise<Response>, clerkAdapter?: ReturnType<typeof createClerkAdapter>) {
  const accountRoute = /^\/(?:sign-in|onboarding|admin|favorites|profile|add-recipe|api\/(?:accounts|media|drafts))(?:\/|$)/.test(new URL(request.url).pathname);
  let response: Response;
  try {
    const adapter = accountRoute ? (clerkAdapter ?? (accountConfiguration() ? getClerkAdapter() : undefined)) : undefined;
    response = adapter ? await adapter.handleRequest(request, next) : await next();
  } catch (error) {
    if (!accountRoute) throw error;
    response = accountFailure(error);
  }
  // A successful photo read sets its own private cache header; everything else on these routes is never stored.
  const photo = request.method === 'GET' && response.ok && /^\/api\/media\/[^/]+$/.test(new URL(request.url).pathname);
  if (accountRoute && !photo) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
