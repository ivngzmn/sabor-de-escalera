import { readFile } from 'node:fs/promises';
import { importCookbook } from '../src/features/cookbook/importer.ts';
import { parseManifest } from '../src/features/cookbook/manifest.ts';
import { getPool, transaction } from '../src/server/db.ts';
import { exampleEntries, type ExampleFile } from './example-entries.ts';
import { attachAiPhotos, guardRemote, imageKit, upload } from './imagekit-upload.ts';

const remove = process.argv.includes('--remove');
guardRemote();
const provider = imageKit();
const pool = getPool();
const LICENSE = 'AI-generated in the owner’s Google Stitch project. Example only, not for launch.';

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
    const uploads = [];
    for (const [file, caption] of example.photos) uploads.push({ caption, ...(await upload(provider, owner.id, `reference/examples/${file}`)) });
    await attachAiPhotos(pool, owner.id, row, uploads, LICENSE, { baselineConfirmed: true });
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
