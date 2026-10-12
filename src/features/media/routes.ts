import { accounts, type createAccountService } from '../accounts/service';
import { AccountError, assertSameOriginWrite } from '../accounts/permissions';
import { ClerkResponseError, accountConfiguration } from '../../server/clerk';
import { mediaService, MediaError, type createMediaService } from './service';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
interface Dependencies { accounts: ReturnType<typeof createAccountService>; media: ReturnType<typeof createMediaService>; origin: string; }
function failure(error: unknown) {
  if (error instanceof ClerkResponseError) return error.response;
  const status = error instanceof AccountError || error instanceof MediaError ? error.status : 503;
  return Response.json({ ok: false, error: { status, message: status === 401 ? 'Sign-in required.' : status === 403 ? 'Access denied.' : status === 400 ? 'Check your photo details.' : 'Photo service is temporarily unavailable. Please try again.' } }, { status, headers });
}
async function readInput(request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) throw new MediaError(400, 'Invalid request');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2048) throw new MediaError(400, 'Invalid request'); chunks.push(next.value); }
  } finally { await reader.cancel(); reader.releaseLock(); }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input as Record<string, unknown>;
  } catch { throw new MediaError(400, 'Invalid request'); }
}
export async function handleMediaWrite(request: Request, action: 'intents' | 'complete' | 'avatar', dependencies?: Dependencies) {
  try {
    assertSameOriginWrite(request, dependencies?.origin ?? accountConfiguration()?.origin ?? new URL(request.url).origin);
    const actor = await (dependencies?.accounts ?? accounts()).requireActor(request);
    const input = await readInput(request);
    const allowed = action === 'intents' ? ['purpose', 'mime', 'size'] : action === 'complete' ? ['intentId'] : ['assetId'];
    if (Object.keys(input).some((key) => !allowed.includes(key))) throw new MediaError(400, 'Invalid request');
    const service = dependencies?.media ?? mediaService();
    const result = action === 'intents' ? await service.createUploadIntent(actor, input) : action === 'complete' ? await service.completeUpload(actor, String(input.intentId ?? '')) : await service.setAvatar(actor, input.assetId === null ? null : String(input.assetId ?? ''));
    const responseHeaders: Record<string, string> = { ...headers };
    if (!result.ok && result.error.retryAfter) responseHeaders['Retry-After'] = String(result.error.retryAfter);
    return Response.json(result, { status: result.ok ? 200 : result.error.status, headers: responseHeaders });
  } catch (error) { return failure(error); }
}
export async function handleMediaRead(request: Request, assetId: string, dependencies?: Dependencies) {
  try {
    const actor = await (dependencies?.accounts ?? accounts()).requireActor(request);
    const result = await (dependencies?.media ?? mediaService()).readDerivative(actor, assetId, new URL(request.url).searchParams.get('variant') ?? 'gallery');
    if (!result.ok) return Response.json(result, { status: result.error.status, headers });
    return new Response(new Uint8Array(result.value), { headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(result.value.length) } });
  } catch (error) { return failure(error); }
}
