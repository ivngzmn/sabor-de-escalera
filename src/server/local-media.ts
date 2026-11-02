import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { acceptedTypes, MAX_INPUT_BYTES, type Variant } from '../features/media/contracts';
import type { MediaProvider } from './imagekit';
import { MAX_STORED_BYTES } from './media-policy';

export class LocalUploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const PRIVATE_PATH = /^\/private\/[a-zA-Z0-9/-]+\.webp$/;
// Mirrors media-policy's ImageKit transforms so local photos look like delivered ones.
const sizes: Record<Variant, { width: number; height: number; fit: 'cover' | 'inside'; quality: number }> = {
  thumb: { width: 320, height: 240, fit: 'cover', quality: 80 },
  card: { width: 640, height: 480, fit: 'cover', quality: 80 },
  gallery: { width: 1600, height: 1600, fit: 'inside', quality: 85 },
  avatar: { width: 256, height: 256, fit: 'cover', quality: 80 },
};
// One secret per server process: grants are five-minute tokens and never outlive a dev server restart by much.
const processSecret = randomBytes(32).toString('hex');

/** Development stand-in for ImageKit: same grant/inspect/derivative contract, files kept on local disk. */
export function createLocalMediaProvider({ root, secret = processSecret }: { root: string; secret?: string }) {
  const base = resolve(root);
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  function file(path: string) {
    if (!PRIVATE_PATH.test(path) || path.includes('..')) throw new Error('Invalid private path');
    const target = resolve(base, `.${path}`);
    if (!target.startsWith(base + sep)) throw new Error('Invalid private path');
    return target;
  }
  async function read(path: string) {
    try { return await readFile(file(path)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  const provider: MediaProvider & { acceptUpload(token: string, upload: { type: string; bytes: Buffer }): Promise<void> } = {
    async grant(fields, expiresAt) {
      const payload = Buffer.from(JSON.stringify({ folder: fields.folder, fileName: fields.fileName, exp: expiresAt })).toString('base64url');
      return { endpoint: '/api/media/local-upload', fields: {}, token: `${payload}.${sign(payload)}` };
    },
    /** Applies the same pre-transform ImageKit is asked for: upright, at most 2400 px, WebP, metadata removed. */
    async acceptUpload(token, { type, bytes }) {
      const [payload, signature = ''] = token.split('.');
      const expected = Buffer.from(sign(payload ?? ''));
      if (!payload || expected.length !== Buffer.byteLength(signature) || !timingSafeEqual(expected, Buffer.from(signature)))
        throw new LocalUploadError(403, 'Upload access denied.');
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { folder: string; fileName: string; exp: number };
      if (!(grant.exp > Date.now())) throw new LocalUploadError(403, 'Upload expired.');
      if (!acceptedTypes.includes(type) || !bytes.length || bytes.length > MAX_INPUT_BYTES) throw new LocalUploadError(400, 'Choose a JPEG, PNG or WebP photo up to 20 MB.');
      let stored: Buffer;
      try {
        const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 100_000_000, animated: true });
        const meta = await image.metadata();
        if (`image/${meta.format}` !== type || (meta.pages ?? 1) !== 1) throw new Error('Mismatched image');
        stored = await image.rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      } catch {
        throw new LocalUploadError(400, 'Photo could not be processed safely. Please choose another photo.');
      }
      if (stored.length > MAX_STORED_BYTES) throw new LocalUploadError(400, 'Photo is too detailed to store. Please choose another photo.');
      const target = file(`${grant.folder}/${grant.fileName}`);
      await mkdir(dirname(target), { recursive: true });
      try { await writeFile(target, stored, { flag: 'wx' }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new LocalUploadError(409, 'This upload was already used.');
        throw error;
      }
    },
    async inspect(path) {
      const bytes = await read(path);
      return bytes ? { fileId: path, filePath: path, isPrivateFile: true, size: bytes.length, bytes } : null;
    },
    async derivative(path, variant) {
      const bytes = await read(path);
      if (!bytes) throw new Error('Photo not found');
      const size = sizes[variant];
      return sharp(bytes).resize(size.width, size.height, { fit: size.fit, withoutEnlargement: size.fit === 'inside' }).webp({ quality: size.quality }).toBuffer();
    },
    async removeAndPurge(_fileId, path) {
      await rm(file(path), { force: true });
      return { complete: true, purgeId: 'local' };
    },
  };
  return provider;
}

export const localMediaRoot = () => join(process.cwd(), '.media-local');
