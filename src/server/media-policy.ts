import sharp from 'sharp';
import type { Variant } from '../features/media/contracts';
export const MAX_STORED_BYTES = 2000000;
export const variants: Record<Variant, string> = {
  thumb: 'w-320,h-240,c-at_least,cm-extract,f-webp,q-80',
  card: 'w-640,h-480,c-at_least,cm-extract,f-webp,q-80',
  gallery: 'w-1600,h-1600,c-at_max,f-webp,q-85',
  avatar: 'w-256,h-256,c-at_least,cm-extract,f-webp,q-80',
};
// These are provisional bounds, not an assertion of acceptable visual quality.
export const preTransform = 'w-2400,h-2400,c-at_max,f-webp,q-85';
export async function inspectStoredImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_STORED_BYTES) throw new Error('Stored image exceeds limit');
  const image = sharp(bytes, { limitInputPixels: 2400 * 2400, failOn: 'warning' });
  const meta = await image.metadata();
  if (meta.format !== 'webp' || !meta.width || !meta.height || meta.width > 2400 || meta.height > 2400 || (meta.pages ?? 1) !== 1 || meta.exif || meta.xmp || meta.iptc || meta.icc || meta.orientation) throw new Error('Stored image failed inspection');
  // metadata() reads headers; decoding catches corrupt/truncated image content.
  await image.stats();
  return { width: meta.width, height: meta.height };
}
