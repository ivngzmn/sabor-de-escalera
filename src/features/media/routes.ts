import { accounts, type createAccountService } from '../accounts/service';
import { AccountError, assertSameOriginWrite } from '../accounts/permissions';
import { ClerkResponseError, accountConfiguration } from '../../server/clerk';
import { mediaReadiness, mediaService, MediaError, type createMediaService } from './service';
import { MAX_INPUT_BYTES } from './contracts';
import { createLocalMediaProvider, LocalUploadError, localMediaRoot } from '../../server/local-media';
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
    const allowed = action === 'intents' ? ['purpose', 'mime', 'size'] : action === 'complete' ? ['intentId', 'fileId'] : ['assetId'];
    if (Object.keys(input).some((key) => !allowed.includes(key))) throw new MediaError(400, 'Invalid request');
    if (input.fileId !== undefined && (typeof input.fileId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.fileId))) throw new MediaError(400, 'Invalid request');
    const service = dependencies?.media ?? mediaService();
    const result = action === 'intents' ? await service.createUploadIntent(actor, input) : action === 'complete' ? await service.completeUpload(actor, String(input.intentId ?? ''), input.fileId as string | undefined) : await service.setAvatar(actor, input.assetId === null ? null : String(input.assetId ?? ''));
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
    // An asset id never changes its contents (a replacement gets a new id) and only the owner can read this route,
    // so the owner's browser may keep it; without this, every page load refetches through the provider.
    return new Response(new Uint8Array(result.value), { headers: { ...headers, 'Cache-Control': 'private, max-age=3600', 'Content-Type': 'image/webp', 'Content-Length': String(result.value.length) } });
  } catch (error) { return failure(error); }
}
interface LocalUploadDependencies { enabled: boolean; provider: ReturnType<typeof createLocalMediaProvider>; origin: string; }
/** Receives development uploads that would otherwise go straight to ImageKit. Absent unless MEDIA_PROVIDER=local. */
export async function handleLocalUpload(request: Request, dependencies?: LocalUploadDependencies) {
  const readiness = mediaReadiness();
  const enabled = dependencies?.enabled ?? (readiness.provider === 'local' && readiness.enabled);
  if (!enabled) return new Response(null, { status: 404, headers });
  try {
    assertSameOriginWrite(request, dependencies?.origin ?? accountConfiguration()?.origin ?? new URL(request.url).origin);
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_INPUT_BYTES + 65536) throw new LocalUploadError(400, 'Choose a photo up to 20 MB.');
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    const token = form?.get('token');
    if (!(file instanceof File) || typeof token !== 'string') throw new LocalUploadError(400, 'Invalid request');
    const provider = dependencies?.provider ?? createLocalMediaProvider({ root: localMediaRoot() });
    await provider.acceptUpload(token, { type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof LocalUploadError || error instanceof AccountError ? error.status : 503;
    return Response.json({ ok: false, error: { status, message: error instanceof LocalUploadError ? error.message : 'Photo upload failed.' } }, { status, headers });
  }
}
