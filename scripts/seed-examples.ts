import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importCookbook } from '../src/features/cookbook/importer.ts';
import { parseManifest } from '../src/features/cookbook/manifest.ts';
import { getPool, transaction } from '../src/server/db.ts';
import { createImageKitProvider } from '../src/server/imagekit.ts';
import { inspectStoredImage, uploadFields } from '../src/server/media-policy.ts';
import { exampleEntries, type ExampleFile } from './example-entries.ts';

// Usage: pnpm examples:seed [--confirm-remote]    stage the examples, ready for review
//        pnpm examples:remove [--confirm-remote]  delete them and their photos
// Every example has an import key starting with example-, so removal can't touch book recipes.
// Origins the examples added are kept: real recipes can use them.
const remove = process.argv.includes('--remove');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (put it in .env or export it).');
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname) && !process.argv.includes('--confirm-remote'))
  throw new Error('Refusing to change a non-local database without --confirm-remote.');
const { IMAGEKIT_PUBLIC_KEY: publicKey, IMAGEKIT_PRIVATE_KEY: privateKey, IMAGEKIT_URL_ENDPOINT: urlEndpoint } = process.env;
if (!publicKey || !privateKey || !urlEndpoint) throw new Error('Set the three ImageKit variables first.');
const provider = createImageKitProvider({ publicKey, privateKey, urlEndpoint });
const pool = getPool();
const LICENSE = 'AI-generated in the owner’s Google Stitch project. Example only, not for launch.';

async function upload(ownerId: string, file: string) {
  const bytes = await readFile(`reference/examples/${file}`);
  const intent = randomUUID();
  const folder = `/private/${ownerId}/${intent}`;
  const path = `${folder}/image.webp`;
  const grant = await provider.grant(uploadFields(folder, 'image.webp'), Date.now() + 300000);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), file);
  for (const [key, value] of Object.entries(grant.fields)) form.append(key, String(value));
  form.append('token', grant.token);
  const response = await fetch(grant.endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Upload of ${file} failed: ${body.message ?? response.status}`);
  const stored = await provider.inspect(path, body.fileId);
  if (!stored) throw new Error(`Upload of ${file} could not be found.`);
  return { intent, path, stored, size: await inspectStoredImage(stored.bytes), inputBytes: bytes.length };
}

async function seed() {
  const data = JSON.parse(await readFile('scripts/example-recipes.json', 'utf8')) as ExampleFile;
  const owner = (await pool.query<{ id: string }>("SELECT id FROM members WHERE role='owner' LIMIT 1")).rows[0];
  if (!owner) throw new Error('No owner account exists yet.');
  for (const [id, en, es] of data.origins)
    await pool.query('INSERT INTO recipe_origins(id,label_en,label_es) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING', [id, en, es]);
  const parsed = parseManifest(exampleEntries(data));
  if (!parsed.ok) throw new Error(`Examples rejected: ${parsed.error.message}`);
  await importCookbook(pool, parsed.value);
  let staged = 0;
  for (const example of data.recipes) {
    const row = (await pool.query("SELECT e.id,e.recipe_id,r.input FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id WHERE e.import_key=$1", [example.key])).rows[0];
    if (row.input.photos.length) continue;
    const uploads: ({ caption: string } & Awaited<ReturnType<typeof upload>>)[] = [];
    for (const [file, caption] of example.photos) uploads.push({ caption, ...(await upload(owner.id, file)) });
    await transaction(pool, async (client) => {
      const photos = [];
      for (const u of uploads) {
        await client.query("INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',$3,$4,now(),now())", [u.intent, owner.id, u.inputBytes, u.path]);
        const asset = (
          await client.query<{ id: string }>("INSERT INTO media_assets(intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,'recipe',$3,$4,$5,$6,$7) RETURNING id", [u.intent, owner.id, u.stored.fileId, u.path, u.stored.bytes.length, u.size.width, u.size.height])
        ).rows[0];
        await client.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2)", [asset.id, row.recipe_id]);
        await client.query("INSERT INTO photo_credits(asset_id,kind,license,label,recorded_by) VALUES($1,'ai',$2,'ai-illustrative',$3)", [asset.id, LICENSE, owner.id]);
        photos.push({ assetId: asset.id, width: u.size.width, height: u.size.height, caption: u.caption, alt: '', crop: { x: 50, y: 50, zoom: 1 } });
      }
      await client.query('UPDATE recipes SET input=$2,version=version+1,updated_at=now() WHERE id=$1', [row.recipe_id, JSON.stringify({ ...row.input, baselineConfirmed: true, photos })]);
      await client.query("UPDATE cookbook_entries SET image_review='pending' WHERE id=$1", [row.id]);
    });
    staged += 1;
    console.log(`Staged ${example.title} (${uploads.length} ${uploads.length === 1 ? 'photo' : 'photos'}).`);
  }
  console.log(`${staged} examples staged; ${data.recipes.length - staged} already there. They wait at Approve the images (the ceviche at Clear the source).`);
}

async function removeExamples() {
  const assets = await transaction(pool, async (client) => {
    const recipes = (await client.query<{ recipe_id: string }>("SELECT recipe_id FROM cookbook_entries WHERE import_key LIKE 'example-%'")).rows.map((r) => r.recipe_id);
    const found = (
      await client.query<{ id: string; intent_id: string; provider_file_id: string; provider_path: string }>(
        "SELECT a.id,a.intent_id,a.provider_file_id,a.provider_path FROM media_assets a JOIN media_references r ON r.asset_id=a.id WHERE r.kind='recipe' AND r.reference_id=ANY($1::uuid[])",
        [recipes],
      )
    ).rows;
    const ids = found.map((a) => a.id);
    await client.query('DELETE FROM media_references WHERE asset_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM photo_credits WHERE asset_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM media_assets WHERE id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM upload_intents WHERE id=ANY($1::uuid[])', [found.map((a) => a.intent_id)]);
    for (const table of ['recipe_translations', 'recipe_favorites', 'recipe_ratings', 'recipe_publications', 'cookbook_entries'])
      await client.query(`DELETE FROM ${table} WHERE recipe_id=ANY($1::uuid[])`, [recipes]);
    await client.query('DELETE FROM recipes WHERE id=ANY($1::uuid[])', [recipes]);
    console.log(`Removed ${recipes.length} examples and ${found.length} photos from the database.`);
    return found;
  });
  for (const asset of assets) await provider.removeAndPurge(asset.provider_file_id, asset.provider_path);
  console.log('Deleted their files from ImageKit.');
}

try {
  await (remove ? removeExamples() : seed());
} finally {
  await pool.end();
}
