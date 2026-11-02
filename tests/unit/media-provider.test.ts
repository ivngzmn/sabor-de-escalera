import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import * as media from '../../src/server/imagekit';
test('V2 grant signs every upload field exactly as the browser will send it', async () => {
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test' });
  const fields = { fileName: 'unique.webp', isPrivateFile: true, overwriteFile: false, checks: 'bounded', transformation: { pre: 'f-webp' } };
  const grant = await provider.grant(fields, Date.now() + 300000);
  const [header, payload, signature] = grant.token.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT', kid: 'public' });
  // ImageKit compares the multipart strings with the signed payload, so a typed `true` would not match "true".
  expect(grant.fields).toEqual({ fileName: 'unique.webp', isPrivateFile: 'true', overwriteFile: 'false', checks: 'bounded', transformation: '{"pre":"f-webp"}' });
  const { iat, exp, ...signed } = JSON.parse(Buffer.from(payload, 'base64url').toString());
  expect(signed).toEqual(grant.fields);
  expect(signature).toBe(createHmac('sha256', 'secret').update(`${header}.${payload}`).digest('base64url'));
  expect(exp - iat).toBeLessThanOrEqual(300);
});

test('upload fields never send an empty extensions list, which ImageKit rejects', async () => {
  const { uploadFields } = await import('../../src/server/media-policy');
  const fields = uploadFields('/private/owner/intent', 'image.webp');
  expect(fields).not.toHaveProperty('extensions');
  expect(fields).not.toHaveProperty('tags');
  expect(fields).toMatchObject({ isPrivateFile: true, useUniqueFileName: false, overwriteFile: false });
});
test('provider download never follows redirects and rejects oversized responses before buffering', async () => {
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', fetcher: async (_url, options) => {
    expect(options?.redirect).toBe('error');
    return new Response('large', { headers: { 'Content-Length': '2000001' } });
  } });
  await expect(provider.derivative('/private/photo.webp', 'gallery')).rejects.toThrow();
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

test('inspect waits briefly for ImageKit search to list a fresh upload, then gives up', async () => {
  const listings: unknown[][] = [[], [], [{ fileId: 'f1', filePath: '/private/o/i/image.webp', isPrivateFile: true, size: 4 }]];
  const waits: number[] = [];
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', sleep: async (ms) => { waits.push(ms); },
    fetcher: async (url) => String(url).includes('/v1/files?') ? Response.json(listings.shift() ?? []) : new Response(new Uint8Array([1, 2, 3, 4])) });
  expect(await provider.inspect('/private/o/i/image.webp')).toMatchObject({ fileId: 'f1', size: 4 });
  expect(waits).toHaveLength(2);
  const empty = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', sleep: async (ms) => { waits.push(ms); }, fetcher: async () => Response.json([]) });
  waits.length = 0;
  expect(await empty.inspect('/private/o/i/image.webp')).toBeNull();
  expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(8000);
});

test('a file id from the browser is only a lookup hint and must resolve to the server-chosen path', async () => {
  const seen: string[] = [];
  const detail = (filePath: string) => ({ fileId: 'f1', filePath, isPrivateFile: true, size: 4 });
  const make = (detailsPath: string) => media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', sleep: async () => {},
    fetcher: async (url) => {
      seen.push(String(url).replace(/\?.*$/, ''));
      if (String(url).includes('/details')) return Response.json(detail(detailsPath));
      if (String(url).includes('/v1/files?')) return Response.json([]);
      return new Response(new Uint8Array([1, 2, 3, 4]));
    } });
  expect(await make('/private/o/i/image.webp').inspect('/private/o/i/image.webp', 'f1')).toMatchObject({ fileId: 'f1' });
  expect(seen.some((u) => u.endsWith('/v1/files?') || u.endsWith('/v1/files'))).toBe(false);
  seen.length = 0;
  // A hint naming someone else's file is ignored, and the search finds nothing at this path.
  expect(await make('/private/other/j/image.webp').inspect('/private/o/i/image.webp', 'f1')).toBeNull();
  expect(seen.some((u) => u.endsWith('/v1/files'))).toBe(true);
});

test('inspect downloads the stored original, not a re-encoded delivery', async () => {
  const urls: string[] = [];
  const provider = media.createImageKitProvider({ publicKey: 'public', privateKey: 'secret', urlEndpoint: 'https://ik.imagekit.io/test', sleep: async () => {},
    fetcher: async (url) => {
      if (String(url).includes('/v1/files?')) return Response.json([{ fileId: 'f1', filePath: '/private/o/i/image.webp', isPrivateFile: true, size: 4 }]);
      urls.push(String(url));
      return new Response(new Uint8Array([1, 2, 3, 4]));
    } });
  await provider.inspect('/private/o/i/image.webp');
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(/^https:\/\/ik\.imagekit\.io\/test\/tr:orig-true\/private\/o\/i\/image\.webp\?ik-t=/);
});
