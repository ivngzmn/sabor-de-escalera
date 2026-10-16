import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import sharp from 'sharp';
import { migrate } from '../../src/server/db';
import { createAccountService, type Actor } from '../../src/features/accounts/service';

const url = process.env.TEST_DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Media tests require isolated local PostgreSQL');
const schema = `media_${randomUUID().replaceAll('-', '')}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
import * as media from '../../src/features/media/service';
let actor: Actor;
let foreign: Actor;
let bytes: Buffer;
const files = new Map<string, { fileId: string; filePath: string; isPrivateFile: boolean; size: number; bytes: Buffer }>();
let deletionFails = false;
const deleted: string[] = [];
const provider = {
  grant: async (fields: Record<string, unknown>) => ({ endpoint: 'https://upload.imagekit.io/api/v2/files/upload', fields, token: 'test-provider-token' }),
  inspect: async (path: string) => files.get(path) ?? null,
  derivative: async () => bytes,
  removeAndPurge: async (fileId: string) => { if (deletionFails) throw new Error('Provider unavailable'); deleted.push(fileId); return { complete: true, purgeId: 'fixture-purge' }; },
};
const service = () => media.createMediaService({ pool, provider, ready: true });
const input = { purpose: 'recipe', mime: 'image/jpeg', size: 20000000 };
function upload(intent: { path: string }, changes = {}) { files.set(intent.path, { fileId: randomUUID(), filePath: intent.path, isPrivateFile: true, size: bytes.length, bytes, ...changes }); }
function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T { if (!result.ok) throw result.error; return result.value; }
beforeAll(async () => { await root.query(`CREATE SCHEMA ${schema}`); await migrate(pool); bytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#775522' } }).webp().toBuffer(); });
beforeEach(async () => {
  await pool.query('TRUNCATE members CASCADE'); files.clear(); deleted.length = 0; deletionFails = false;
  const accounts = createAccountService({ pool, origin: 'https://recipes.example', verifyIdentity: async () => null });
  actor = await accounts.ensureMember({ provider: 'clerk', subject: 'member', email: 'a@example.com', emailVerified: true });
  foreign = await accounts.ensureMember({ provider: 'clerk', subject: 'other', email: 'b@example.com', emailVerified: true });
  await pool.query('UPDATE members SET onboarded_at=now()');
});
afterAll(async () => { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); });

test('guests, spoofed actors, suspended contributors and invalid input cannot get grants; avatars remain optional', async () => {
  const svc = service();
  expect(await svc.createUploadIntent(null, input)).toMatchObject({ ok: false, error: { status: 401 } });
  expect(await svc.createUploadIntent({ ...actor, id: randomUUID() }, input)).toMatchObject({ ok: false });
  for (const change of [{ size: 20000001 }, { size: 0 }, { mime: 'image/svg+xml' }, { mime: 'image/heic' }]) expect(await svc.createUploadIntent(actor, { ...input, ...change })).toMatchObject({ ok: false, error: { status: 400 } });
  await pool.query('UPDATE members SET suspended=true WHERE id=$1', [actor.id]);
  expect(await svc.createUploadIntent({ ...actor, suspended: false }, input)).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await svc.createUploadIntent(actor, { ...input, purpose: 'avatar' })).toMatchObject({ ok: true });
});
test('allowed formats receive short lived immutable private grants and durable 30/hour limits under concurrency', async () => {
  const svc = service();
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const intent = value(await svc.createUploadIntent(actor, { ...input, mime }));
    expect(intent.grant.fields).toMatchObject({ isPrivateFile: true, overwriteFile: false, useUniqueFileName: false, extensions: [] });
    expect(intent.grant.fields.checks).toContain('20000000');
    expect(intent.expiresAt - Date.now()).toBeLessThanOrEqual(300000);
  }
  const results = await Promise.all(Array.from({ length: 30 }, () => svc.createUploadIntent(actor, input)));
  expect(results.filter((result) => result.ok)).toHaveLength(27);
  expect(results.filter((result) => !result.ok)).toHaveLength(3);
  expect(results.find((result) => !result.ok)).toMatchObject({ error: { status: 429, retryAfter: expect.any(Number) } });
});
test('completion rejects foreign, expired and suspended intents, and safely retries the same completion', async () => {
  const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent);
  expect(await svc.completeUpload(foreign, intent.id)).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query('UPDATE members SET suspended=true WHERE id=$1', [actor.id]);
  expect(await svc.completeUpload(actor, intent.id)).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query('UPDATE members SET suspended=false WHERE id=$1', [actor.id]);
  expect(await svc.completeUpload(actor, intent.id)).toMatchObject({ ok: true, value: { width: 640, height: 480 } });
  const retried = value(await svc.completeUpload(actor, intent.id));
  expect((await pool.query('SELECT id FROM media_assets')).rows).toEqual([{ id: retried.id }]);
  const expired = value(await svc.createUploadIntent(actor, input)); upload(expired);
  await pool.query("UPDATE upload_intents SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
  expect(await svc.completeUpload(actor, expired.id)).toMatchObject({ ok: false, error: { status: 409 } });
});
test('completion decodes bounded stored bytes and rejects spoofing, metadata, oversized and public files', async () => {
  const svc = service();
  const tagged = await sharp(bytes).withExif({ IFD0: { Artist: 'private metadata' } }).webp().toBuffer();
  for (const changes of [{ bytes: Buffer.from('<svg/>') }, { bytes: tagged, size: tagged.length }, { size: 20000001 }, { isPrivateFile: false }, { filePath: '/foreign.webp' }]) {
    const intent = value(await svc.createUploadIntent(actor, input)); upload(intent, changes);
    expect(await svc.completeUpload(actor, intent.id)).toMatchObject({ ok: false });
  }
  expect((await pool.query('SELECT * FROM media_assets')).rowCount).toBe(0);
});
test('failed avatar replacement keeps original; successful replacement commits reference before immediate cleanup, with retryable deletion', async () => {
  const svc = service();
  async function avatar() { const intent = value(await svc.createUploadIntent(actor, { ...input, purpose: 'avatar' })); upload(intent); return value(await svc.completeUpload(actor, intent.id)); }
  const old = await avatar(); expect(await svc.setAvatar(actor, old.id)).toMatchObject({ ok: true });
  expect(await svc.setAvatar(foreign, old.id)).toMatchObject({ ok: false });
  expect(await svc.setAvatar(actor, randomUUID())).toMatchObject({ ok: false });
  expect((await pool.query('SELECT avatar_asset_id FROM members WHERE id=$1', [actor.id])).rows[0].avatar_asset_id).toBe(old.id);
  await svc.disposeUnusedAsset(old.id); expect(deleted).toHaveLength(0);
  const next = await avatar(); deletionFails = true;
  expect(await svc.setAvatar(actor, next.id)).toMatchObject({ ok: true });
  expect((await pool.query('SELECT state FROM media_assets WHERE id=$1', [old.id])).rows[0].state).toBe('deleting');
  deletionFails = false; await svc.disposeUnusedAsset(old.id);
  expect(deleted).toHaveLength(1);
  expect((await pool.query('SELECT state FROM media_assets WHERE id=$1', [old.id])).rows[0].state).toBe('deleted');
});
test('private delivery rejects guest, foreign access, raw/original variants and hidden assets', async () => {
  const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent); const asset = value(await svc.completeUpload(actor, intent.id));
  for (const who of [null, foreign]) expect(await svc.readDerivative(who, asset.id, 'gallery')).toMatchObject({ ok: false });
  expect(await svc.readDerivative(actor, asset.id, 'original')).toMatchObject({ ok: false });
  expect(await svc.readDerivative(actor, asset.id, 'gallery')).toMatchObject({ ok: true });
  await svc.disposeUnusedAsset(asset.id);
  expect(await svc.readDerivative(actor, asset.id, 'gallery')).toMatchObject({ ok: false });
});
test('production readiness is fail closed even if credentials or an enable switch are supplied', async () => {
  expect(media.mediaReadiness({ IMAGEKIT_PRIVATE_KEY: 'private', IMAGEKIT_PUBLIC_KEY: 'public', MEDIA_ENABLED: 'true' }).enabled).toBe(false);
  const svc = media.createMediaService({ pool, provider, ready: false });
  expect(await svc.createUploadIntent(actor, input)).toMatchObject({ ok: false, error: { status: 503 } });
  expect((await pool.query('SELECT * FROM upload_intents')).rowCount).toBe(0);
});

test('media HTTP boundary authenticates, enforces exact origin, rejects altered completion input and never shares caches', async () => {
  const { handleMediaWrite } = await import('../../src/features/media/routes');
  const accountService = createAccountService({ pool, origin: 'https://recipes.example', verifyIdentity: async (request) => request.headers.get('Authorization') === 'fixture' ? { provider: 'clerk', subject: 'member', email: 'a@example.com', emailVerified: true } : null });
  const dependencies = { accounts: accountService, media: service(), origin: 'https://recipes.example' };
  function request(body: unknown, origin = 'https://recipes.example', auth = 'fixture') { return new Request('https://recipes.example/api/media/intents', { method: 'POST', headers: { Origin: origin, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  for (const [req, status] of [[request(input, 'https://evil.example'), 403], [request(input, 'https://recipes.example', ''), 401]] as const) {
    const response = await handleMediaWrite(req, 'intents', dependencies);
    expect(response.status).toBe(status); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  }
  expect((await handleMediaWrite(request({ ...input, role: 'owner' }), 'intents', dependencies)).status).toBe(400);
  expect((await handleMediaWrite(request({ intentId: randomUUID(), fileId: 'foreign' }), 'complete', dependencies)).status).toBe(400);
  const response = await handleMediaWrite(request(input), 'intents', dependencies);
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});

test('media routes preserve Clerk synchronization redirects and cookies', async () => {
  const { createClerkAdapter } = await import('../../src/server/clerk');
  const { handleAccountRequest } = await import('../../src/server/account-request');
  const headers = new Headers({ Location: 'https://clerk.example/handshake' }); headers.append('Set-Cookie', '__session=one'); headers.append('Set-Cookie', '__client=two');
  const adapter = createClerkAdapter({ authenticateRequest: async () => ({ status: 'handshake', headers, isAuthenticated: false, toAuth: () => ({}) }), getUser: async () => { throw new Error('unreachable'); } });
  const response = await handleAccountRequest(new Request('https://recipes.example/api/media/intents'), async () => new Response('wrong boundary'), adapter);
  expect(response.status).toBe(307); expect(response.headers.getSetCookie()).toHaveLength(2); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});

test('daily quotas apply after the hourly window, and provider grant failure still consumes a durable attempt', async () => {
  const svc = service();
  await pool.query(`INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,created_at,expires_at)
    SELECT gen_random_uuid(),$1,'recipe','image/jpeg',1,'/fixture/'||n,now()-interval '2 hours',now()-interval '1 hour' FROM generate_series(1,100) n`, [actor.id]);
  expect(await svc.createUploadIntent(actor, input)).toMatchObject({ ok: false, error: { status: 429 } });
  const failing = media.createMediaService({ pool, provider: { ...provider, grant: async () => { throw new Error('Offline'); } }, ready: true });
  expect(await failing.createUploadIntent(foreign, input)).toMatchObject({ ok: false, error: { status: 503 } });
  expect((await pool.query('SELECT count(*)::int AS total FROM upload_intents WHERE owner_id=$1', [foreign.id])).rows[0].total).toBe(1);
});

test('long-lived saved references prevent cleanup and administrator roles cannot claim foreign uploads', async () => {
  const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent); const asset = value(await svc.completeUpload(actor, intent.id));
  await pool.query("INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2)", [asset.id, randomUUID()]);
  await pool.query("UPDATE media_assets SET created_at=now()-interval '2 years' WHERE id=$1", [asset.id]);
  await svc.disposeUnusedAsset(asset.id);
  expect(deleted).toHaveLength(0); expect(await svc.readDerivative(actor, asset.id, 'gallery')).toMatchObject({ ok: true });
  for (const role of ['admin', 'owner'] as const) {
    await pool.query('UPDATE members SET role=$2 WHERE id=$1', [foreign.id, role]);
    expect(await svc.completeUpload({ ...foreign, role }, intent.id)).toMatchObject({ ok: false, error: { status: 403 } });
  }
  await pool.query("UPDATE media_assets SET state='hidden' WHERE id=$1", [asset.id]);
  expect(await svc.readDerivative(actor, asset.id, 'gallery')).toMatchObject({ ok: false });
  expect(await svc.completeUpload(actor, intent.id)).toMatchObject({ ok: false, error: { status: 409 } });
});

function blockedProvider() {
  let release!: () => void;
  let entered!: () => void;
  const arrived = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  // Always release the external seam, even if an assertion/setup fails.
  let released = false;
  const finish = () => { released = true; release(); };
  const timer = setTimeout(finish, 5000);
  return { arrived, get released() { return released; }, release: () => { clearTimeout(timer); finish(); }, wait: async () => { entered(); await held; } };
}
async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} waited on provider I/O`)), 1500); })]); }
  finally { clearTimeout(timer); }
}

for (const operation of ['complete', 'read'] as const) {
  test(`${operation}: stalled provider permits same-member and unrelated-member authentication`, async () => {
    const gate = blockedProvider();
    const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent);
    const asset = operation === 'read' ? value(await svc.completeUpload(actor, intent.id)) : null;
    const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider,
      inspect: async (path) => { await gate.wait(); return provider.inspect(path); },
      derivative: async () => { await gate.wait(); return provider.derivative(); },
    } });
    const pending = operation === 'complete' ? delayed.completeUpload(actor, intent.id) : delayed.readDerivative(actor, asset!.id, 'gallery');
    const accounts = createAccountService({ pool, origin: 'https://recipes.example', verifyIdentity: async (request) => ({ provider: 'clerk', subject: request.headers.get('Authorization')!, email: request.headers.get('Authorization') === 'member' ? 'a@example.com' : 'b@example.com', emailVerified: true }) });
    let same: Promise<Actor> | undefined; let other: Promise<Actor> | undefined;
    try {
      await within(gate.arrived, 'provider entry');
      same = accounts.requireActor(new Request('https://recipes.example/onboarding', { headers: { Authorization: 'member' } }));
      // Start the same-member map first: it would hold the account global lock
      // while blocked by the media row lock in the regression.
      other = accounts.requireActor(new Request('https://recipes.example/onboarding', { headers: { Authorization: 'other' } }));
      const actors = await within(Promise.all([same, other]), 'authentication');
      expect(actors.map((member) => member.id)).toEqual([actor.id, foreign.id]);
      expect(gate.released).toBe(false);
    } finally { gate.release(); await Promise.allSettled([pending, same, other]); }
    expect(await pending).toMatchObject({ ok: true });
  });
}

for (const change of ['suspended', 'expired', 'ownership', 'path'] as const) {
  test(`completion rechecks ${change} after asynchronous inspection`, async () => {
    const gate = blockedProvider(); const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent);
    const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider, inspect: async (path) => { await gate.wait(); return provider.inspect(path); } } });
    const pending = delayed.completeUpload(actor, intent.id);
    try {
      await within(gate.arrived, 'provider entry');
      const sql = change === 'suspended' ? 'UPDATE members SET suspended=true WHERE id=$1' : change === 'expired' ? "UPDATE upload_intents SET expires_at=now()-interval '1 second' WHERE id=$1" : change === 'ownership' ? 'UPDATE upload_intents SET owner_id=$2 WHERE id=$1' : "UPDATE upload_intents SET provider_path=provider_path||'.changed' WHERE id=$1";
      const values = change === 'suspended' ? [actor.id] : change === 'ownership' ? [intent.id, foreign.id] : [intent.id];
      await within(pool.query(sql, values), 'concurrent state change');
    } finally { gate.release(); await pending; }
    expect(await pending).toMatchObject({ ok: false, error: { status: change === 'suspended' || change === 'ownership' ? 403 : 409 } });
    expect((await pool.query('SELECT * FROM media_assets')).rowCount).toBe(0);
  });
}

test('concurrent owned completion returns one asset without another intent or reference', async () => {
  const gate = blockedProvider(); const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent);
  const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider, inspect: async (path) => { await gate.wait(); return provider.inspect(path); } } });
  const pending = delayed.completeUpload(actor, intent.id);
  let completed;
  try { await within(gate.arrived, 'provider entry'); completed = value(await within(svc.completeUpload(actor, intent.id), 'concurrent completion')); }
  finally { gate.release(); await pending; }
  expect(value(await pending)).toEqual(completed);
  expect((await pool.query('SELECT id FROM media_assets')).rows).toEqual([{ id: completed!.id }]);
  expect((await pool.query('SELECT * FROM upload_intents')).rowCount).toBe(1);
  expect((await pool.query('SELECT * FROM media_references')).rowCount).toBe(0);
});

test('avatar replacement during a derivative fetch revokes the old bytes before return', async () => {
  const svc = service();
  async function avatar() { const intent = value(await svc.createUploadIntent(actor, { ...input, purpose: 'avatar' })); upload(intent); return value(await svc.completeUpload(actor, intent.id)); }
  const old = await avatar(); const next = await avatar(); value(await svc.setAvatar(actor, old.id));
  const gate = blockedProvider();
  const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider, derivative: async () => { await gate.wait(); return provider.derivative(); } } });
  const pending = delayed.readDerivative(actor, old.id, 'avatar');
  try { await within(gate.arrived, 'provider entry'); expect(await within(svc.setAvatar(actor, next.id), 'avatar replacement')).toMatchObject({ ok: true }); }
  finally { gate.release(); await pending; }
  expect(await pending).toMatchObject({ ok: false, error: { status: 404 } });
  expect((await pool.query('SELECT asset_id FROM media_references WHERE reference_id=$1', [actor.id])).rows).toEqual([{ asset_id: next.id }]);
  expect(deleted).toHaveLength(1);
});

test('overlapping completion cannot acknowledge a different provider file saved by another request', async () => {
  const gate = blockedProvider(); const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent);
  const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider, inspect: async (path) => { const inspected = await provider.inspect(path); await gate.wait(); return inspected; } } });
  const pending = delayed.completeUpload(actor, intent.id);
  let completed;
  try {
    await within(gate.arrived, 'provider entry');
    upload(intent); // A different provider identity at the same private path.
    completed = value(await within(svc.completeUpload(actor, intent.id), 'concurrent completion'));
  } finally { gate.release(); await pending; }
  expect(await pending).toMatchObject({ ok: false, error: { status: 409 } });
  expect((await pool.query('SELECT id FROM media_assets')).rows).toEqual([{ id: completed!.id }]);
});

for (const change of ['ownership', 'path'] as const) {
  test(`private read rejects ${change} changes committed while fetching bytes`, async () => {
    const svc = service(); const intent = value(await svc.createUploadIntent(actor, input)); upload(intent); const asset = value(await svc.completeUpload(actor, intent.id));
    const gate = blockedProvider();
    const delayed = media.createMediaService({ pool, ready: true, provider: { ...provider, derivative: async () => { await gate.wait(); return provider.derivative(); } } });
    const pending = delayed.readDerivative(actor, asset.id, 'gallery');
    try {
      await within(gate.arrived, 'provider entry');
      await within(pool.query(change === 'ownership' ? 'UPDATE media_assets SET owner_id=$2 WHERE id=$1' : 'UPDATE media_assets SET provider_path=$2 WHERE id=$1', [asset.id, change === 'ownership' ? foreign.id : '/private/changed.webp']), 'asset change');
    } finally { gate.release(); await pending; }
    expect(await pending).toMatchObject({ ok: false, error: { status: 404 } });
  });
}

test('recipe photo delivery requires the intended current public reference and rechecks visibility after provider transport',async()=>{
 const svc=service(),intent=value(await svc.createUploadIntent(actor,input));upload(intent);const asset=value(await svc.completeUpload(actor,intent.id));
 const {createDraftService}=await import('../../src/features/recipes/drafts');const {emptyRecipe}=await import('../../src/features/recipes/validation');
 const drafts=createDraftService({pool,disposeUnusedAsset:svc.disposeUnusedAsset});const draft=value(await drafts.createDraft(actor));
 await drafts.saveDraft(actor,draft.id,1,{...emptyRecipe(),photos:[{assetId:asset.id,caption:'Photo',alt:'',crop:{x:50,y:50,zoom:1}}]});
 const publicRead=(svc as typeof svc & {readRecipeDerivative?:(recipeId:string,assetId:string,variant:string)=>Promise<unknown>}).readRecipeDerivative;
 expect(publicRead,'public delivery must authorize current intended references').toBeTypeOf('function');if(!publicRead)return;
 expect(await publicRead(draft.id,asset.id,'gallery')).toMatchObject({ok:false,error:{status:404}});
 await pool.query("UPDATE recipes SET state='published' WHERE id=$1",[draft.id]);
 expect(await publicRead(draft.id,asset.id,'gallery')).toMatchObject({ok:true});
 expect(await publicRead(randomUUID(),asset.id,'gallery')).toMatchObject({ok:false});
 expect(await publicRead(draft.id,asset.id,'original')).toMatchObject({ok:false});
 const gate=blockedProvider();const delayed=media.createMediaService({pool,ready:true,provider:{...provider,derivative:async()=>{await gate.wait();return bytes;}}});
 const pending=delayed.readRecipeDerivative(draft.id,asset.id,'gallery');
 try{await gate.arrived;await pool.query("UPDATE recipes SET state='hidden' WHERE id=$1",[draft.id]);gate.release();expect(await pending).toMatchObject({ok:false,error:{status:404}});}finally{gate.release();await pending;}
});
