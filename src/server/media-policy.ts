import sharp from 'sharp';
import { MAX_INPUT_BYTES, type Variant } from '../features/media/contracts.ts';
export const MAX_STORED_BYTES = 2000000;
export const variants: Record<Variant, string> = {
  thumb: 'w-320,h-240,c-at_least,cm-extract,f-webp,q-80',
  card: 'w-640,h-480,c-at_least,cm-extract,f-webp,q-80',
  gallery: 'w-1600,h-1600,c-at_max,f-webp,q-85',
  avatar: 'w-256,h-256,c-at_least,cm-extract,f-webp,q-80',
};
// These are provisional bounds, not an assertion of acceptable visual quality.
export const preTransform = 'w-2400,h-2400,c-at_max,f-webp,q-85';
/** Every upload field ImageKit receives; all are signed into the V2 token, none come from the browser. Omitting extensions runs none (an empty list is rejected). */
export function uploadFields(folder: string, fileName: string) {
  return { fileName, folder, isPrivateFile: true, useUniqueFileName: false, overwriteFile: false, overwriteAITags: false, overwriteTags: false, overwriteCustomMetadata: false, transformation: { pre: preTransform }, checks: `"file.size" <= ${MAX_INPUT_BYTES} AND "file.mime" IN ["image/jpeg","image/png","image/webp"]` };
}
/** ImageKit's pre-transform resizes and strips metadata but keeps JPEG as JPEG; every delivered variant is WebP. */
export async function inspectStoredImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_STORED_BYTES) throw new Error('Stored image exceeds limit');
  const image = sharp(bytes, { limitInputPixels: 2400 * 2400, failOn: 'warning' });
  const meta = await image.metadata();
  if (!['webp', 'jpeg', 'png'].includes(meta.format ?? '') || !meta.width || !meta.height || meta.width > 2400 || meta.height > 2400 || (meta.pages ?? 1) !== 1 || meta.exif || meta.xmp || meta.iptc || meta.icc || meta.orientation) throw new Error('Stored image failed inspection');
  // metadata() reads headers; decoding catches corrupt/truncated image content.
  await image.stats();
  return { width: meta.width, height: meta.height };
}
