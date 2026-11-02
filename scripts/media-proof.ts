import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createImageKitProvider } from '../src/server/imagekit.ts';
import { inspectStoredImage, uploadFields, variants } from '../src/server/media-policy.ts';

// Usage (owner only, with the account's keys in the environment, never on the command line):
//   pnpm media:proof            core privacy checks, about 1 MB of uploads
//   pnpm media:proof --large    also sends a 21 MB file to prove the size limit
// Every file this creates lives under /private/media-proof/ and is deleted at the end.
// The output names checks only; it never prints keys, tokens or signed URLs.
const { IMAGEKIT_PUBLIC_KEY: publicKey, IMAGEKIT_PRIVATE_KEY: privateKey, IMAGEKIT_URL_ENDPOINT: urlEndpoint } = process.env;
if (!publicKey || !privateKey || !urlEndpoint) throw new Error('Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT first.');
const large = process.argv.includes('--large');
const provider = createImageKitProvider({ publicKey, privateKey, urlEndpoint });
const base = urlEndpoint.replace(/\/$/, '');
const run = randomUUID();
const results: { name: string; pass: boolean; note: string }[] = [];
const cleanup: { fileId: string; path: string }[] = [];

async function check(name: string, fn: () => Promise<string | void>) {
  try {
    results.push({ name, pass: true, note: (await fn()) ?? '' });
  } catch (error) {
    results.push({ name, pass: false, note: error instanceof Error ? error.message : 'failed' });
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const pathFor = (name: string) => ({ folder: `/private/media-proof/${run}/${name}`, fileName: 'image.webp' });
/** Sends a V2 upload exactly as ImageKitUploader does, optionally tampering with the request. */
async function upload(name: string, file: Blob, tamper?: (form: FormData, token: string) => string) {
  const { folder, fileName } = pathFor(name);
  const grant = await provider.grant(uploadFields(folder, fileName), Date.now() + 300000);
  const form = new FormData();
  form.append('file', file, 'upload');
  for (const [key, value] of Object.entries(grant.fields)) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  form.append('token', tamper ? tamper(form, grant.token) : grant.token);
  const response = await fetch(grant.endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
  const body = await response.json().catch(() => ({}));
  if (response.ok && typeof body.fileId === 'string') cleanup.push({ fileId: body.fileId, path: `${folder}/${fileName}` });
  return { status: response.status, path: `${folder}/${fileName}`, grant, form };
}
const status = async (url: string) => (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })).status;
const denied = (code: number) => code >= 400 && code < 500;

// A landscape photo stored rotated (EXIF orientation 6) with GPS and camera metadata.
const photo = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#c45a3c' } })
  .composite([{ input: Buffer.from('<svg width="1800" height="1200"><rect x="0" y="0" width="600" height="400" fill="#2f6b3a"/></svg>'), top: 0, left: 0 }])
  .jpeg({ quality: 90 })
  .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'ProofCamera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 26/1 46/1' } } })
  .toBuffer();
const jpeg = new Blob([new Uint8Array(photo)], { type: 'image/jpeg' });

const main = await upload('main', jpeg);
await check('signed upload is accepted', async () => assert(main.status === 200, `upload returned ${main.status}`));

await check('stored file is private, bounded, upright WebP without metadata', async () => {
  const file = await provider.inspect(main.path);
  assert(file, 'uploaded file not found under its signed path');
  const size = await inspectStoredImage(file.bytes);
  assert(size.height > size.width, 'orientation was not applied to the pixels');
  return `${size.width}×${size.height}, ${file.bytes.length} bytes`;
});

for (const variant of Object.keys(variants) as (keyof typeof variants)[])
  await check(`signed ${variant} derivative is WebP without metadata`, async () => {
    const size = await inspectStoredImage(await provider.derivative(main.path, variant));
    return `${size.width}×${size.height}`;
  });

await check('unsigned original URL is refused', async () => {
  const code = await status(`${base}${main.path}`);
  assert(denied(code), `returned ${code}`);
  return String(code);
});
await check('unsigned transformed URL is refused', async () => {
  const code = await status(`${base}/tr:w-200${main.path}`);
  assert(denied(code), `returned ${code}`);
  return String(code);
});
// ImageKit's built-in media-library thumbnail is a named transformation that can bypass private-file signing.
for (const named of ['ik_ml_thumbnail', 'media_library_thumbnail'])
  await check(`unsigned named transformation ${named} is refused`, async () => {
    const code = await status(`${base}/tr:n-${named}${main.path}`);
    assert(denied(code), `returned ${code}`);
    return String(code);
  });
await check('signed URL with an expired signature is refused', async () => {
  const signed = new URL(`${base}${main.path}`);
  signed.searchParams.set('ik-t', String(Math.floor(Date.now() / 1000) - 60));
  signed.searchParams.set('ik-s', '0'.repeat(40));
  const code = await status(signed.href);
  assert(denied(code), `returned ${code}`);
  return String(code);
});

await check('reusing a spent upload token is refused', async () => {
  const replay = new FormData();
  for (const [key, value] of main.form.entries()) replay.append(key, value);
  const response = await fetch(main.grant.endpoint, { method: 'POST', body: replay, signal: AbortSignal.timeout(120000) });
  assert(!response.ok, `replay returned ${response.status}`);
  return String(response.status);
});
await check('changing a signed field is refused', async () => {
  const result = await upload('tampered', jpeg, (form, token) => {
    form.set('isPrivateFile', 'false');
    return token;
  });
  assert(result.status !== 200, 'public upload was accepted');
  return String(result.status);
});
await check('adding an unsigned field is refused', async () => {
  const result = await upload('extra', jpeg, (form, token) => {
    form.append('customMetadata', JSON.stringify({ injected: true }));
    return token;
  });
  assert(result.status !== 200, 'unsigned field was accepted');
  return String(result.status);
});
await check('a forged token signature is refused', async () => {
  const result = await upload('forged', jpeg, (_form, token) => `${token.split('.').slice(0, 2).join('.')}.${'A'.repeat(43)}`);
  assert(result.status !== 200, 'forged token was accepted');
  return String(result.status);
});
await check('SVG content is refused', async () => {
  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/jpeg' });
  const result = await upload('svg', svg);
  assert(result.status !== 200, 'SVG was accepted');
  return String(result.status);
});
if (large)
  await check('a file over 20 MB is refused before storage', async () => {
    const noise = await sharp(Buffer.from(Array.from({ length: 3000 * 2400 * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: 3000, height: 2400, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    assert(noise.length > 20_000_000, 'test file is not over 20 MB');
    const result = await upload('large', new Blob([new Uint8Array(noise)], { type: 'image/png' }));
    assert(result.status !== 200, 'oversized file was accepted');
    return `${noise.length} bytes → ${result.status}`;
  });

await check('deletion purges the cache for every variant', async () => {
  const file = await provider.inspect(main.path);
  assert(file, 'nothing to delete');
  // Warm every cached variant first, so the purge has something to remove.
  for (const variant of Object.keys(variants) as (keyof typeof variants)[]) await provider.derivative(main.path, variant);
  let cleanupState = await provider.removeAndPurge(file.fileId, main.path);
  const started = Date.now();
  while (!cleanupState.complete && Date.now() - started < 300000) {
    await new Promise((done) => setTimeout(done, 10000));
    cleanupState = await provider.removeAndPurge(file.fileId, main.path, cleanupState.purgeId);
  }
  assert(cleanupState.complete, 'purge did not complete within 5 minutes');
  cleanup.splice(cleanup.findIndex((c) => c.path === main.path), 1);
  for (const variant of Object.keys(variants) as (keyof typeof variants)[])
    await provider.derivative(main.path, variant).then(
      () => { throw new Error(`${variant} is still served after purge`); },
      () => undefined,
    );
});

for (const leftover of cleanup) await provider.removeAndPurge(leftover.fileId, leftover.path).catch(() => undefined);

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.note}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed. Keep MEDIA_LIVE_PROOF_PASSED unset.` : `\nAll checks passed. Still do the manual checks in docs/operations/media-proof.md, then set MEDIA_LIVE_PROOF_PASSED=${new Date().toISOString().slice(0, 10)}.`);
process.exitCode = failed ? 1 : 0;
