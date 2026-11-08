import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getPool } from '../src/server/db.ts';
import { attachAiPhotos, guardRemote, imageKit, removeAiPhotos, upload } from './imagekit-upload.ts';

// Usage: pnpm photos:attach <mapping.json> [--confirm-remote]          attach AI images, ready for image review
//        pnpm photos:attach <mapping.json> --remove [--confirm-remote] take them off again
// The mapping lives next to its images (keep both in reference/, which is gitignored):
//   { "license": "where the images came from", "photos": { "<import key>": [["file.jpg", "caption"], ...] } }
// Readers see these photos labelled “AI-generated illustrative image”. Recipes that already have photos are skipped.
interface Mapping {
  license: string;
  photos: Record<string, [string, string][]>;
}
const mappingPath = process.argv[2];
if (!mappingPath || mappingPath.startsWith('--')) throw new Error('Pass the mapping file, e.g. reference/book-photos/attach.json');
const mapping = JSON.parse(await readFile(mappingPath, 'utf8')) as Mapping;
if (!mapping.license?.trim()) throw new Error('The mapping needs a license line saying where the images came from.');
guardRemote();
const provider = imageKit();
const pool = getPool();

async function rows() {
  const keys = Object.keys(mapping.photos);
  const found = (await pool.query('SELECT e.id,e.import_key,e.recipe_id,r.input FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id WHERE e.import_key=ANY($1)', [keys])).rows;
  const missing = keys.filter((k) => !found.some((r) => r.import_key === k));
  if (missing.length) throw new Error(`No staged recipe for ${missing.join(', ')}`);
  return found;
}

try {
  const found = await rows();
  if (process.argv.includes('--remove')) {
    const removed = await removeAiPhotos(pool, provider, found.map((r) => r.recipe_id), mapping.license);
    console.log(`Removed ${removed} photos from ${found.length} recipes.`);
  } else {
    const owner = (await pool.query<{ id: string }>("SELECT id FROM members WHERE role='owner' LIMIT 1")).rows[0];
    if (!owner) throw new Error('No owner account exists yet.');
    let attached = 0;
    for (const row of found) {
      if (row.input.photos.length) {
        console.log(`Skipped ${row.input.title}: it already has photos.`);
        continue;
      }
      const uploads = [];
      for (const [file, caption] of mapping.photos[row.import_key]) uploads.push({ caption, ...(await upload(provider, owner.id, join(dirname(mappingPath), file))) });
      await attachAiPhotos(pool, owner.id, row, uploads, mapping.license);
      attached += 1;
      console.log(`Attached ${uploads.length} to ${row.input.title}.`);
    }
    console.log(`${attached} recipes now wait at Approve the images.`);
  }
} finally {
  await pool.end();
}
