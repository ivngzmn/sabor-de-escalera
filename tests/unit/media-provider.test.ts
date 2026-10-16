import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import * as media from '../../src/server/imagekit';
test('V2 grant signs every constrained upload field and expires within five minutes', async () => {
  expect(media.createImageKitProvider).toBeTypeOf('function');
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test' });
  const fields = { fileName: 'unique.webp', isPrivateFile: true, overwriteFile: false, extensions: [], checks: 'bounded', transformation: { pre: 'f-webp' } };
  const grant = await provider.grant(fields, Date.now() + 300000);
  const [header, payload, signature] = grant.token.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT', kid: 'public' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  expect(claims).toMatchObject({ fileName: 'unique.webp', isPrivateFile: 'true', overwriteFile: 'false', checks: 'bounded', transformation: '{"pre":"f-webp"}' });
  expect(claims).not.toHaveProperty('extensions');
  expect(grant.fields).toEqual({ fileName: 'unique.webp', isPrivateFile: 'true', overwriteFile: 'false', checks: 'bounded', transformation: '{"pre":"f-webp"}' });
  expect(signature).toBe(createHmac('sha256', 'secret').update(`${header}.${payload}`).digest('base64url'));
  expect(JSON.parse(Buffer.from(payload, 'base64url').toString()).exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300);
});
test('provider download never follows redirects and rejects oversized responses before buffering', async () => {
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', fetcher: async (_url, options) => {
    expect(options?.redirect).toBe('error');
    return new Response('large', { headers: { 'Content-Length': '2000001' } });
  } });
  await expect(provider.derivative('/private/photo.webp', 'gallery')).rejects.toThrow();
});

test('retained-file inspection downloads the original rather than automatic delivery optimization', async () => {
  const original = Buffer.from('retained WebP bytes');
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', fetcher: async (url) => {
    if (String(url).startsWith('https://api.imagekit.io/')) return Response.json([{ fileId: 'file', filePath: '/private/photo.webp', isPrivateFile: true, size: original.length }]);
    return new Response(String(url).includes('/tr:orig-true/') ? original : Buffer.from('automatic JPEG delivery'));
  } });
  expect((await provider.inspect('/private/photo.webp'))?.bytes).toEqual(original);
});

test('asynchronous purge remains incomplete until the persisted provider job completes', async () => {
  let status = 'Pending';
  const seen: string[] = [];
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', fetcher: async (url, options) => {
    seen.push(String(url));
    if (options?.method === 'DELETE') return new Response(null, { status: 404 });
    if (options?.method === 'POST') return Response.json({ requestId: 'purge-1' });
    return Response.json({ status });
  } });
  expect(await provider.removeAndPurge('file', '/private/photo.webp')).toEqual({ complete: false, purgeId: 'purge-1' });
  expect(await provider.removeAndPurge('file', '/private/photo.webp', 'purge-1')).toEqual({ complete: false, purgeId: 'purge-1' });
  status = 'Completed';
  expect(await provider.removeAndPurge('file', '/private/photo.webp', 'purge-1')).toEqual({ complete: true, purgeId: 'purge-1' });
  expect(seen.filter((url) => url === 'https://api.imagekit.io/v1/files/purge')).toHaveLength(1);
});
