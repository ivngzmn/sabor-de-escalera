import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { transaction } from '../src/server/db.ts';
import { createImageKitProvider } from '../src/server/imagekit.ts';
import { inspectStoredImage, uploadFields } from '../src/server/media-policy.ts';
import type { Pool } from 'pg';

/** Scripts that write to the database refuse a remote one unless --confirm-remote is passed. */
export function guardRemote() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (put it in .env or export it).');
  if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname) && !process.argv.includes('--confirm-remote'))
    throw new Error('Refusing to change a non-local database without --confirm-remote.');
}

export function imageKit() {
  const { IMAGEKIT_PUBLIC_KEY: publicKey, IMAGEKIT_PRIVATE_KEY: privateKey, IMAGEKIT_URL_ENDPOINT: urlEndpoint } = process.env;
  if (!publicKey || !privateKey || !urlEndpoint) throw new Error('Set the three ImageKit variables first.');
  return createImageKitProvider({ publicKey, privateKey, urlEndpoint });
}
type Provider = ReturnType<typeof imageKit>;

/** Uploads one JPEG through the same signed, pre-transformed path members use. */
export async function upload(provider: Provider, ownerId: string, file: string) {
  const bytes = await readFile(file);
  const intent = randomUUID();
  const folder = `/private/${ownerId}/${intent}`;
  const path = `${folder}/image.webp`;
  const grant = await provider.grant(uploadFields(folder, 'image.webp'), Date.now() + 300000);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), file.split('/').pop());
  for (const [key, value] of Object.entries(grant.fields)) form.append(key, String(value));
  form.append('token', grant.token);
  const response = await fetch(grant.endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Upload of ${file} failed: ${body.message ?? response.status}`);
  const stored = await provider.inspect(path, body.fileId);
  if (!stored) throw new Error(`Upload of ${file} could not be found.`);
  return { intent, path, stored, size: await inspectStoredImage(stored.bytes), inputBytes: bytes.length };
}

/**
 * Attaches uploaded AI images to a recipe and sends it back to the image review step.
 * Readers see them labelled “AI-generated illustrative image”.
 */
export async function attachAiPhotos(
  pool: Pool,
  ownerId: string,
  row: { id: string; recipe_id: string; input: { photos: unknown[] } & Record<string, unknown> },
  uploads: ({ caption: string } & Awaited<ReturnType<typeof upload>>)[],
  license: string,
  extra: Record<string, unknown> = {},
) {
  await transaction(pool, async (client) => {
    const photos = [];
    for (const u of uploads) {
      await client.query("INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',$3,$4,now(),now())", [u.intent, ownerId, u.inputBytes, u.path]);
      const asset = (
        await client.query<{ id: string }>("INSERT INTO media_assets(intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,'recipe',$3,$4,$5,$6,$7) RETURNING id", [u.intent, ownerId, u.stored.fileId, u.path, u.stored.bytes.length, u.size.width, u.size.height])
      ).rows[0];
      await client.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2)", [asset.id, row.recipe_id]);
      await client.query("INSERT INTO photo_credits(asset_id,kind,license,label,recorded_by) VALUES($1,'ai',$2,'ai-illustrative',$3)", [asset.id, license, ownerId]);
      photos.push({ assetId: asset.id, width: u.size.width, height: u.size.height, caption: u.caption, alt: '', crop: { x: 50, y: 50, zoom: 1 } });
    }
    await client.query('UPDATE recipes SET input=$2,version=version+1,updated_at=now() WHERE id=$1', [row.recipe_id, JSON.stringify({ ...row.input, ...extra, photos: [...row.input.photos, ...photos] })]);
    await client.query("UPDATE cookbook_entries SET image_review='pending' WHERE id=$1", [row.id]);
  });
}

/** Deletes the given recipes' photos whose credit license matches, from the database and then ImageKit. */
export async function removeAiPhotos(pool: Pool, provider: Provider, recipeIds: string[], license: string) {
  const found = await transaction(pool, async (client) => {
    const assets = (
      await client.query<{ id: string; intent_id: string; provider_file_id: string; provider_path: string; reference_id: string }>(
        `SELECT a.id,a.intent_id,a.provider_file_id,a.provider_path,r.reference_id FROM media_assets a
         JOIN media_references r ON r.asset_id=a.id JOIN photo_credits c ON c.asset_id=a.id
         WHERE r.kind='recipe' AND r.reference_id=ANY($1::uuid[]) AND c.license=$2`,
        [recipeIds, license],
      )
    ).rows;
    const ids = assets.map((a) => a.id);
    for (const recipeId of new Set(assets.map((a) => a.reference_id))) {
      const { input } = (await client.query('SELECT input FROM recipes WHERE id=$1 FOR UPDATE', [recipeId])).rows[0];
      const photos = input.photos.filter((p: { assetId: string }) => !ids.includes(p.assetId));
      await client.query('UPDATE recipes SET input=$2,version=version+1,updated_at=now() WHERE id=$1', [recipeId, JSON.stringify({ ...input, photos })]);
      await client.query(`UPDATE cookbook_entries SET image_review=CASE WHEN $2 THEN 'pending' ELSE 'missing' END WHERE recipe_id=$1`, [recipeId, photos.length > 0]);
    }
    await client.query('DELETE FROM media_references WHERE asset_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM photo_credits WHERE asset_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM media_assets WHERE id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM upload_intents WHERE id=ANY($1::uuid[])', [assets.map((a) => a.intent_id)]);
    return assets;
  });
  for (const asset of found) await provider.removeAndPurge(asset.provider_file_id, asset.provider_path);
  return found.length;
}
