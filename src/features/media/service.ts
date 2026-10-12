import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Actor } from '../accounts/service';
import { getPool, transaction } from '../../server/db';
import { inspectStoredImage, preTransform, variants } from '../../server/media-policy';
import { imageKitProvider, type MediaProvider } from '../../server/imagekit';
import { acceptedTypes, MAX_INPUT_BYTES, type AssetRef, type Purpose, type Result, type UploadIntent, type Variant } from './contracts';
export class MediaError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) { super(message); }
}
async function result<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) {
    return { ok: false, error: error instanceof MediaError ? { status: error.status, message: error.message, retryAfter: error.retryAfter } : { status: 503, message: 'Photo service is temporarily unavailable. Please try again.' } };
  }
}
export function mediaReadiness(environment: Readonly<Record<string, string | undefined>> = process.env) {
  // No environment flag can certify unperformed provider proofs. Enable this
  // only in a reviewed change containing the evidence in media-proof.md.
  return { enabled: false, configured: Boolean(environment.IMAGEKIT_PRIVATE_KEY && environment.IMAGEKIT_PUBLIC_KEY && environment.IMAGEKIT_URL_ENDPOINT) };
}
interface Options { pool: Pool; provider: MediaProvider; ready: boolean; }
interface IntentRow { id: string; owner_id: string; purpose: Purpose; provider_path: string; expires_at: Date; completed_at: Date | null; }
interface AssetRow { id: string; owner_id: string; purpose: Purpose; provider_file_id: string; provider_path: string; state: string; purge_request_id?: string; width: number; height: number; }
const ref = (row: AssetRow): AssetRef => ({ id: row.id, width: row.width, height: row.height });
const isId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
export function createMediaService({ pool, provider, ready }: Options) {
  function available() { if (!ready) throw new MediaError(503, 'Photo uploads are temporarily unavailable. Please try again later.'); }
  async function authorize(client: PoolClient, actor: Actor | null, purpose?: Purpose) {
    if (!actor || !isId(actor.id)) throw new MediaError(401, 'Sign-in required.');
    // Public Actor fields are never permission evidence. Serialize grants and
    // profile/reference changes per member, rechecking current database state.
    const member = (await client.query('SELECT id,suspended,onboarded_at FROM members WHERE id=$1 FOR UPDATE', [actor.id])).rows[0];
    if (!member) throw new MediaError(401, 'Sign-in required.');
    if (purpose && purpose !== 'avatar' && (member.suspended || !member.onboarded_at)) throw new MediaError(403, 'Contributions are currently unavailable for this account.');
    return member;
  }
  async function completionState(client: PoolClient, actor: Actor | null, intentId: string) {
    await authorize(client, actor);
    const intent = (await client.query<IntentRow>('SELECT * FROM upload_intents WHERE id=$1 FOR UPDATE', [intentId])).rows[0];
    if (!intent || intent.owner_id !== actor!.id) throw new MediaError(403, 'Upload access denied.');
    await authorize(client, actor, intent.purpose);
    if (intent.completed_at) {
      const asset = (await client.query<AssetRow>("SELECT * FROM media_assets WHERE intent_id=$1 AND owner_id=$2 AND state='ready' FOR SHARE", [intent.id, actor!.id])).rows[0];
      if (!asset || asset.provider_path !== intent.provider_path) throw new MediaError(409, 'This photo is no longer available.');
      return { intent, asset };
    }
    if (intent.expires_at.getTime() <= Date.now()) throw new MediaError(409, 'Upload expired. Please retry your photo.');
    return { intent, asset: null };
  }
  async function readableAsset(client: PoolClient, actor: Actor | null, assetId: string) {
    await authorize(client, actor);
    const asset = (await client.query<AssetRow>("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND state='ready' FOR SHARE", [assetId, actor!.id])).rows[0];
    if (!asset) throw new MediaError(404, 'Photo not found.');
    return asset;
  }
  async function disposeUnusedAsset(assetId: string): Promise<void> {
    if (!isId(assetId)) return;
    const pending = await transaction(pool, async (client) => {
      const asset = (await client.query<AssetRow>('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE', [assetId])).rows[0];
      if (!asset || asset.state === 'deleted') return null;
      if ((await client.query('SELECT 1 FROM media_references WHERE asset_id=$1 LIMIT 1', [assetId])).rowCount) return null;
      await client.query("UPDATE media_assets SET state='deleting',cleanup_requested_at=COALESCE(cleanup_requested_at,now()),cleanup_attempts=cleanup_attempts+1 WHERE id=$1", [assetId]);
      return asset;
    });
    if (!pending) return;
    // The tombstone prevents new attachment and delivery. Provider failure keeps
    // a durable retry record; successful DB/reference replacement stays saved.
    try {
      const cleanup = await provider.removeAndPurge(pending.provider_file_id, pending.provider_path, pending.purge_request_id);
      await pool.query("UPDATE media_assets SET state=$2,purge_request_id=$3 WHERE id=$1 AND state='deleting'", [assetId, cleanup.complete ? 'deleted' : 'deleting', cleanup.purgeId]);
    } catch { /* Reconciliation retries deleting rows; never erase the tombstone. */ }
  }
  const api = {
    createUploadIntent(actor: Actor | null, input: Record<string, unknown>): Promise<Result<UploadIntent>> {
      return result(async () => {
        available();
        const { purpose, mime, size } = input;
        if (!['recipe', 'cooking', 'avatar'].includes(String(purpose)) || !acceptedTypes.includes(String(mime)) || typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_INPUT_BYTES) throw new MediaError(400, 'Choose a JPEG, PNG or WebP photo up to 20 MB.');
        const intent = await transaction(pool, async (client) => {
          await authorize(client, actor, purpose as Purpose);
          const counts = (await client.query(`SELECT count(*) FILTER (WHERE created_at>now()-interval '1 hour')::int AS hourly,count(*)::int AS daily,
            extract(epoch FROM min(created_at) FILTER (WHERE created_at>now()-interval '1 hour')+interval '1 hour'-now())::int AS hour_retry,
            extract(epoch FROM min(created_at)+interval '1 day'-now())::int AS day_retry
            FROM upload_intents WHERE owner_id=$1 AND created_at>now()-interval '1 day'`, [actor!.id])).rows[0];
          if (counts.hourly >= 30 || counts.daily >= 100) throw new MediaError(429, 'Photo upload limit reached. Your work is preserved. Please retry later.', Math.max(1, counts.daily >= 100 ? counts.day_retry : counts.hour_retry));
          const id = randomUUID(); const folder = `/private/${actor!.id}/${id}`; const fileName = 'image.webp';
          const expiresAt = Date.now() + 300000;
          await client.query('INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, actor!.id, purpose, mime, size, `${folder}/${fileName}`, new Date(expiresAt)]);
          return { id, folder, fileName, expiresAt };
        });
        const fields = { fileName: intent.fileName, folder: intent.folder, isPrivateFile: true, useUniqueFileName: false, overwriteFile: false, overwriteAITags: false, overwriteTags: false, overwriteCustomMetadata: false, extensions: [], tags: [], transformation: { pre: preTransform }, checks: `"file.size" <= ${MAX_INPUT_BYTES} AND "file.mime" IN ["image/jpeg","image/png","image/webp"]` };
        return { id: intent.id, path: `${intent.folder}/${intent.fileName}`, expiresAt: intent.expiresAt, grant: await provider.grant(fields, intent.expiresAt) };
      });
    },
    completeUpload(actor: Actor | null, intentId: string): Promise<Result<AssetRef>> {
      return result(async () => {
        available();
        if (!isId(intentId)) throw new MediaError(400, 'Invalid upload.');
        const initial = await transaction(pool, (client) => completionState(client, actor, intentId));
        if (initial.asset) return ref(initial.asset);
        // The committed intent reserves the path. Provider latency and decoding
        // hold no DB connection or member/intent lock. Concurrent inspection is
        // safe: the final transaction serializes completion and reuses one asset.
        const file = await provider.inspect(initial.intent.provider_path);
        if (!file || file.filePath !== initial.intent.provider_path || file.isPrivateFile !== true || file.size !== file.bytes.length) throw new MediaError(400, 'Photo could not be verified. Please retry.');
        let dimensions;
        try { dimensions = await inspectStoredImage(file.bytes); } catch { throw new MediaError(400, 'Photo could not be processed safely. Please choose another photo.'); }
        return transaction(pool, async (client) => {
          const current = await completionState(client, actor, intentId);
          if (current.intent.provider_path !== initial.intent.provider_path || current.intent.purpose !== initial.intent.purpose) throw new MediaError(409, 'Upload changed. Please retry your photo.');
          if (current.asset) {
            if (current.asset.provider_file_id !== file.fileId) throw new MediaError(409, 'Upload changed. Please retry your photo.');
            return ref(current.asset);
          }
          const asset = (await client.query<AssetRow>(`INSERT INTO media_assets(intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [intentId, actor!.id, current.intent.purpose, file.fileId, file.filePath, file.bytes.length, dimensions.width, dimensions.height])).rows[0];
          await client.query('UPDATE upload_intents SET completed_at=now() WHERE id=$1', [intentId]);
          return ref(asset);
        });
      });
    },
    setAvatar(actor: Actor | null, assetId: string | null): Promise<Result<AssetRef | null>> {
      return result(async () => {
        available();
        if (assetId !== null && !isId(assetId)) throw new MediaError(400, 'Invalid photo.');
        const change = await transaction(pool, async (client) => {
          await authorize(client, actor, 'avatar');
          const old = (await client.query('SELECT avatar_asset_id FROM members WHERE id=$1', [actor!.id])).rows[0].avatar_asset_id as string | null;
          const asset = assetId ? (await client.query<AssetRow>("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND purpose='avatar' AND state='ready' FOR UPDATE", [assetId, actor!.id])).rows[0] : null;
          if (assetId && !asset) throw new MediaError(403, 'Photo access denied.');
          await client.query('UPDATE members SET avatar_asset_id=$2 WHERE id=$1', [actor!.id, assetId]);
          await client.query("DELETE FROM media_references WHERE kind='avatar' AND reference_id=$1", [actor!.id]);
          if (assetId) await client.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'avatar',$2)", [assetId, actor!.id]);
          return { old, asset: asset ? ref(asset) : null };
        });
        if (change.old && change.old !== assetId) await disposeUnusedAsset(change.old);
        return change.asset;
      });
    },
    readDerivative(actor: Actor | null, assetId: string, variant: string): Promise<Result<Buffer>> {
      return result(async () => {
        available();
        if (!isId(assetId) || !Object.hasOwn(variants, variant)) throw new MediaError(404, 'Photo not found.');
        // Public delivery will require an active, visible content reference; no
        // caller-supplied visibility bit or URL can authorize access here.
        const initial = await transaction(pool, (client) => readableAsset(client, actor, assetId));
        const bytes = await provider.derivative(initial.provider_path, variant as Variant);
        await inspectStoredImage(bytes);
        // Recheck immediately before releasing bytes: replacement, hiding,
        // ownership changes or deletion may have committed during the fetch.
        return transaction(pool, async (client) => {
          const current = await readableAsset(client, actor, assetId);
          if (current.provider_file_id !== initial.provider_file_id || current.provider_path !== initial.provider_path) throw new MediaError(404, 'Photo not found.');
          return bytes;
        });
      });
    },
    disposeUnusedAsset,
  };
  return api;
}
export function mediaService() { return createMediaService({ pool: getPool(), provider: imageKitProvider(), ready: mediaReadiness().enabled }); }
export const createUploadIntent = (actor: Actor, input: Record<string, unknown>) => mediaService().createUploadIntent(actor, input);
export const completeUpload = (actor: Actor, intentId: string) => mediaService().completeUpload(actor, intentId);
export const disposeUnusedAsset = (assetId: string) => mediaService().disposeUnusedAsset(assetId);
