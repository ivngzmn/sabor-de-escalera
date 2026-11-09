import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, test } from 'vitest';
import { createLocalMediaProvider, LocalUploadError } from '../../src/server/local-media';
import { inspectStoredImage } from '../../src/server/media-policy';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function provider() {
  const root = mkdtempSync(join(tmpdir(), 'local-media-'));
  roots.push(root);
  return createLocalMediaProvider({ root, secret: 'test-secret' });
}
const fields = (folder = '/private/owner/intent') => ({ folder, fileName: 'image.webp' });
const jpeg = (width = 3000, height = 2000) =>
  sharp({ create: { width, height, channels: 3, background: '#c45a3c' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

test('uploads are bounded to private WebP with no metadata', async () => {
  const media = provider();
  const grant = await media.grant(fields(), Date.now() + 300000);
  expect(grant.endpoint).toBe('/api/media/local-upload');
  await media.acceptUpload(grant.token, { type: 'image/jpeg', bytes: await jpeg() });
  const file = await media.inspect('/private/owner/intent/image.webp');
  expect(file).toMatchObject({ filePath: '/private/owner/intent/image.webp', isPrivateFile: true });
  // Orientation 6 is baked into the pixels, so the stored image is portrait.
  expect(await inspectStoredImage(file!.bytes)).toEqual({ width: 1600, height: 2400 });
});

test('a grant uploads once and cannot be altered or reused after expiry', async () => {
  const media = provider();
  const grant = await media.grant(fields(), Date.now() + 300000);
  const bytes = await jpeg(400, 300);
  await media.acceptUpload(grant.token, { type: 'image/jpeg', bytes });
  await expect(media.acceptUpload(grant.token, { type: 'image/jpeg', bytes })).rejects.toMatchObject({ status: 409 });
  const [payload, signature] = grant.token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), folder: '/private/other/intent' })).toString('base64url');
  await expect(media.acceptUpload(`${forged}.${signature}`, { type: 'image/jpeg', bytes })).rejects.toBeInstanceOf(LocalUploadError);
  const expired = await media.grant(fields('/private/owner/late'), Date.now() - 1000);
  await expect(media.acceptUpload(expired.token, { type: 'image/jpeg', bytes })).rejects.toMatchObject({ status: 403 });
});

test('rejects disguised, oversized and animated files', async () => {
  const media = provider();
  const upload = async (type: string, bytes: Buffer) =>
    media.acceptUpload((await media.grant(fields(`/private/owner/${Math.random().toString(36).slice(2)}`), Date.now() + 300000)).token, { type, bytes });
  await expect(upload('image/jpeg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toMatchObject({ status: 400 });
  await expect(upload('image/png', await jpeg(10, 10))).rejects.toMatchObject({ status: 400 });
  await expect(upload('image/gif', await jpeg(10, 10))).rejects.toMatchObject({ status: 400 });
  await expect(upload('image/jpeg', Buffer.alloc(20000001))).rejects.toMatchObject({ status: 400 });
  // Two different frames; identical frames are merged into a still image.
  const frames = Buffer.concat([Buffer.alloc(10 * 10 * 3, 0), Buffer.alloc(10 * 10 * 3, 255)]);
  const animated = await sharp(frames, { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  await expect(upload('image/webp', animated)).rejects.toMatchObject({ status: 400 });
});

test('derivatives use fixed sizes and deletion completes', async () => {
  const media = provider();
  const grant = await media.grant(fields(), Date.now() + 300000);
  await media.acceptUpload(grant.token, { type: 'image/jpeg', bytes: await jpeg(1200, 900) });
  const card = await sharp(await media.derivative('/private/owner/intent/image.webp', 'card')).metadata();
  expect([card.format, card.width, card.height]).toEqual(['webp', 640, 480]);
  expect(await media.removeAndPurge('ignored', '/private/owner/intent/image.webp')).toMatchObject({ complete: true });
  expect(await media.inspect('/private/owner/intent/image.webp')).toBeNull();
  await expect(media.derivative('/private/../../etc/passwd.webp', 'card')).rejects.toThrow();
});

test('the local upload route is absent unless the local provider is on, and same-origin only', async () => {
  const { handleLocalUpload } = await import('../../src/features/media/routes');
  const media = provider();
  const grant = await media.grant(fields(), Date.now() + 300000);
  const form = () => {
    const body = new FormData();
    body.append('file', new File([new Uint8Array(0)], 'photo.jpg', { type: 'image/jpeg' }));
    body.append('token', grant.token);
    return body;
  };
  const post = (origin: string) => new Request('https://recipes.example/api/media/local-upload', { method: 'POST', headers: { Origin: origin }, body: form() });
  expect((await handleLocalUpload(post('https://recipes.example'), { enabled: false, provider: media, origin: 'https://recipes.example' })).status).toBe(404);
  expect((await handleLocalUpload(post('https://evil.example'), { enabled: true, provider: media, origin: 'https://recipes.example' })).status).toBe(403);
  const ok = new FormData();
  ok.append('file', new File([await jpeg(40, 30)], 'photo.jpg', { type: 'image/jpeg' }));
  ok.append('token', grant.token);
  const accepted = await handleLocalUpload(new Request('https://recipes.example/api/media/local-upload', { method: 'POST', headers: { Origin: 'https://recipes.example' }, body: ok }), { enabled: true, provider: media, origin: 'https://recipes.example' });
  expect(accepted.status).toBe(200);
});

test('stored originals may be JPEG, PNG or WebP but never carry metadata, animation or excess size', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const)
    expect(await inspectStoredImage(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123' } })[format]().toBuffer())).toEqual({ width: 40, height: 30 });
  await expect(inspectStoredImage(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer())).rejects.toThrow();
  await expect(inspectStoredImage(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123' } }).gif().toBuffer())).rejects.toThrow();
});
