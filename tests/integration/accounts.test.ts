import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import * as accountModule from '../../src/features/accounts/service';
import * as permissionModule from '../../src/features/accounts/permissions';
import { handleAdminWrite } from '../../src/features/accounts/routes';
import { migrate } from '../../src/server/db';
import * as clerkModule from '../../src/server/clerk';
import { handleAccountRequest } from '../../src/server/account-request';
import { accountConfiguration } from '../../src/server/clerk';
import type { AuthIdentity } from '../../src/features/accounts/service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) throw new Error('Account integration tests require an isolated local TEST_DATABASE_URL');
const schema = `accounts_${randomUUID().replaceAll('-', '')}`;
const root = new Pool({ connectionString: databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 5 });
const origin = 'https://recipes.example';
const identities = new Map<string, AuthIdentity>();
function service() {
  return accountModule.createAccountService({ pool, origin, ownerBootstrapEmail: 'owner@example.com', verifyIdentity: async (request: Request) => identities.get(request.headers.get('Authorization') ?? '') ?? null });
}
function identity(subject: string, email = `${subject}@example.com`, emailVerified = true) {
  const value = { provider: 'clerk' as const, subject, email, emailVerified };
  identities.set(subject, value);
  return value;
}
function request(subject = '', method = 'POST', requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { Authorization: subject };
  if (requestOrigin) headers.Origin = requestOrigin;
  return new Request(`${origin}/onboarding`, { method, headers });
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await Promise.all([migrate(pool), migrate(pool)]);
});
beforeEach(async () => {
  identities.clear();
  await pool.query('TRUNCATE admin_invitations, account_audit, owner_binding, members CASCADE');
});
afterAll(async () => { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); });

test('verified subject mapping is idempotent under concurrency and survives verified email changes', async () => {
  const accounts = service();
  const initial = identity('member');
  const actors = await Promise.all(Array.from({ length: 8 }, () => accounts.ensureMember(initial)));
  expect(new Set(actors.map((actor) => actor.id)).size).toBe(1);
  const updated = await accounts.ensureMember(identity('member', 'new@example.com'));
  expect(updated.id).toBe(actors[0].id);
  expect(updated.role).toBe('member');
  expect(JSON.stringify(updated)).not.toContain('@example.com');
  expect((await pool.query('SELECT verified_email FROM members WHERE id=$1', [updated.id])).rows[0].verified_email).toBe('new@example.com');
});

test('unverified identities and guests cannot create or access accounts', async () => {
  const accounts = service();
  await expect(accounts.ensureMember(identity('member', 'owner@example.com', false))).rejects.toMatchObject({ status: 401 });
  await expect(accounts.requireActor(request('', 'GET'))).rejects.toMatchObject({ status: 401 });
  expect((await pool.query('SELECT count(*)::int AS count FROM members')).rows[0].count).toBe(0);
});

test('secure owner bootstrap stays bound after email change and never creates a second owner', async () => {
  const accounts = service();
  const candidates = await Promise.all([accounts.ensureMember(identity('owner', 'owner@example.com')), accounts.ensureMember(identity('impostor', 'owner@example.com'))]);
  expect(candidates.filter((actor) => actor.role === 'owner')).toHaveLength(1);
  const winner = candidates.find((actor) => actor.role === 'owner')!;
  const ownerSubject = winner.id === candidates[0].id ? 'owner' : 'impostor';
  expect((await accounts.ensureMember(identity(ownerSubject, 'changed@example.com'))).role).toBe('owner');
  expect((await accounts.ensureMember(identity('latecomer', 'owner@example.com'))).role).toBe('member');
});

test('onboarding stores only validated public profile fields and cannot elevate public role fields', async () => {
  const accounts = service();
  identity('member');
  const actor = await accounts.updateProfile(request('member'), { displayName: '  Ana  ', bio: 'Family recipes', avatarPreset: 'chile', role: 'owner', suspended: false, verified_email: 'owner@example.com' });
  expect(actor).toMatchObject({ role: 'member', displayName: 'Ana', onboarded: true, avatarPreset: 'chile' });
  const sameName = await accounts.ensureMember(identity('other'));
  expect((await accounts.updateProfile(request('other'), { displayName: 'Ana' })).displayName).toBe('Ana');
  expect(sameName.id).not.toBe(actor.id);
  for (const fields of [{ displayName: '' }, { displayName: 'a'.repeat(81) }, { displayName: 'Ana', bio: 'a'.repeat(401) }, { displayName: 'Ana', avatarPreset: 'https://evil.example/x' }]) {
    await expect(accounts.updateProfile(request('member'), fields)).rejects.toMatchObject({ status: 400 });
  }
});

test('cookie authenticated writes reject absent and foreign origins before mutation', async () => {
  const accounts = service();
  identity('member');
  for (const invalid of [null, 'https://evil.example', 'https://recipes.example.evil']) {
    await expect(accounts.updateProfile(request('member', 'POST', invalid), { displayName: 'Ana' })).rejects.toMatchObject({ status: 403 });
  }
  expect((await pool.query('SELECT count(*)::int AS count FROM members')).rows[0].count).toBe(0);
});

test('invitations require owner, expire, match verified email and are redeemed once', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('admin', 'invited@example.com'); identity('other');
  const invitation = await accounts.inviteAdmin(request('owner'), ' Invited@Example.com ');
  await expect(accounts.inviteAdmin(request('other'), 'evil@example.com')).rejects.toMatchObject({ status: 403 });
  expect((await accounts.requireActor(request('other', 'GET'))).role).toBe('member');
  const actors = await Promise.all(Array.from({ length: 5 }, () => accounts.requireActor(request('admin', 'GET'))));
  expect(actors.every((actor) => actor.role === 'admin')).toBe(true);
  expect((await pool.query('SELECT redeemed_by FROM admin_invitations WHERE id=$1', [invitation.id])).rows[0].redeemed_by).toBe(actors[0].id);
  expect((await accounts.ensureMember(identity('different-subject', 'invited@example.com'))).role).toBe('member');
  const expired = await accounts.inviteAdmin(request('owner'), 'expired@example.com');
  await pool.query("UPDATE admin_invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
  expect((await accounts.ensureMember(identity('expired'))).role).toBe('member');
});

test('guest, other member, suspended member, admin and owner are checked at the request boundary', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('member'); identity('other'); identity('suspended'); identity('admin');
  await accounts.inviteAdmin(request('owner'), 'admin@example.com');
  const member = await accounts.updateProfile(request('member'), { displayName: 'Member' });
  const suspended = await accounts.updateProfile(request('suspended'), { displayName: 'Suspended' });
  await pool.query('UPDATE members SET suspended=true WHERE id=$1', [suspended.id]);
  const admin = await accounts.updateProfile(request('admin'), { displayName: 'Admin' });
  const owner = await accounts.updateProfile(request('owner'), { displayName: 'Owner' });
  for (const [subject, adminAllowed, ownerAllowed, ownsAllowed] of [['', false, false, false], ['member', false, false, true], ['other', false, false, false], ['suspended', false, false, false], ['admin', true, false, true], ['owner', true, true, true]] as const) {
    const checks = [accounts.requireAdmin(request(subject, 'GET')), accounts.requireOwner(request(subject, 'GET')), accounts.requireOwnedContribution(request(subject), member.id)];
    const outcomes = await Promise.allSettled(checks);
    expect(outcomes.map((outcome) => outcome.status === 'fulfilled'), subject).toEqual([adminAllowed, ownerAllowed, ownsAllowed]);
  }
  expect(permissionModule.canContribute(await accounts.requireActor(request('suspended', 'GET')))).toBe(false);
  expect(permissionModule.canContribute(member)).toBe(true);
  await expect(accounts.readAudit(request('admin', 'GET'))).rejects.toMatchObject({ status: 403 });
  await expect(accounts.removeAdmin(request('admin'), admin.id)).rejects.toMatchObject({ status: 403 });
  await expect(accounts.removeAdmin(request('owner'), owner.id)).rejects.toMatchObject({ status: 400 });
  await accounts.removeAdmin(request('owner'), admin.id);
  await expect(accounts.requireAdmin(request('admin', 'GET'))).rejects.toMatchObject({ status: 403 });
  expect((await accounts.readAudit(request('owner', 'GET'))).some((event) => event.action === 'admin_removed')).toBe(true);
});

test('safe return keeps favorite recipe action and language but rejects external and ambiguous URLs', async () => {
  expect(permissionModule.safeReturnTo('/recipes/arroz?intent=favorite&lang=es#save', origin)).toBe('/recipes/arroz?intent=favorite&lang=es#save');
  for (const url of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', 'javascript:alert(1)', '/sign-in?returnTo=/sign-in', '/onboarding']) expect(permissionModule.safeReturnTo(url, origin)).toBe('/');
});

test('pending invitations can be revoked only by owner and no longer grant admin', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('member');
  const invite = await accounts.inviteAdmin(request('owner'), 'member@example.com');
  await expect(accounts.revokeInvitation(request('member'), invite.id)).rejects.toMatchObject({ status: 403 });
  await accounts.revokeInvitation(request('owner'), invite.id);
  expect((await accounts.requireActor(request('member', 'GET'))).role).toBe('member');
  const list = await accounts.listAdministrators(request('owner', 'GET'));
  expect(list.invitations).toEqual([]);
  await expect(accounts.listAdministrators(request('member', 'GET'))).rejects.toMatchObject({ status: 403 });
});

test('owner-only admin HTTP mutation rejects guest, members and cross-origin requests independently of suspension', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('member'); identity('admin');
  await accounts.inviteAdmin(request('owner'), 'admin@example.com');
  const admin = await accounts.requireActor(request('admin', 'GET'));
  await pool.query('UPDATE members SET suspended=true WHERE id=$1', [admin.id]);
  for (const [subject, requestOrigin, status] of [['', origin, 401], ['member', origin, 403], ['admin', origin, 403], ['owner', 'https://evil.example', 403], ['owner', origin, 303]] as const) {
    const response = await handleAdminWrite(new Request(`${origin}/api/accounts/admin`, { method: 'POST', headers: { Authorization: subject, Origin: requestOrigin }, body: new URLSearchParams({ action: 'invite', email: 'target@example.com' }) }), accounts, origin);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  }
  expect((await pool.query("SELECT count(*)::int AS count FROM admin_invitations WHERE email='target@example.com'")).rows[0].count).toBe(1);
});


test('migration runner is concurrency-safe and repeatable without losing mapped accounts', async () => {
  const actor = await service().ensureMember(identity('retained'));
  await Promise.all([migrate(pool), migrate(pool)]);
  expect((await service().ensureMember(identity('retained'))).id).toBe(actor.id);
  expect((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count).toBe(3);
});

test('auth configuration requires private keys, exact secure origin and verified email-code instance configuration', () => {
  const environment = { PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_configuration', CLERK_SECRET_KEY: 'private-test-fixture', DATABASE_URL: databaseUrl, APP_ORIGIN: origin, CLERK_EMAIL_CODE_CONFIGURED: 'true' };
  expect(accountConfiguration(environment)?.origin).toBe(origin);
  for (const overrides of [{ CLERK_SECRET_KEY: '' }, { CLERK_EMAIL_CODE_CONFIGURED: 'false' }, { APP_ORIGIN: 'http://public.example' }, { APP_ORIGIN: origin + '/other' }]) expect(accountConfiguration({ ...environment, ...overrides })).toBeNull();
});


test('migration CLI applies the same tracked migrations to the isolated local schema', async () => {
  const result = await promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: databaseUrl, PGOPTIONS: `-c search_path=${schema}` } });
  expect(result.stdout).toContain('Database migrations applied.');
  expect((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count).toBe(3);
});


test('suspended staff retain role-based administration while all contributions remain denied', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('admin'); identity('member');
  await accounts.inviteAdmin(request('owner'), 'admin@example.com');
  const admin = await accounts.updateProfile(request('admin'), { displayName: 'Admin' });
  const owner = await accounts.updateProfile(request('owner'), { displayName: 'Owner' });
  const member = await accounts.updateProfile(request('member'), { displayName: 'Member' });
  await pool.query('UPDATE members SET suspended=true WHERE id = ANY($1::uuid[])', [[owner.id, admin.id, member.id]]);
  for (const [subject, adminAllowed, ownerAllowed] of [['owner', true, true], ['admin', true, false], ['member', false, false], ['', false, false]] as const) {
    const outcomes = await Promise.allSettled([accounts.requireAdmin(request(subject, 'GET')), accounts.requireOwner(request(subject, 'GET'))]);
    expect(outcomes.map((outcome) => outcome.status === 'fulfilled'), subject).toEqual([adminAllowed, ownerAllowed]);
    if (subject) expect(permissionModule.canContribute(await accounts.requireActor(request(subject, 'GET')))).toBe(false);
    await expect(accounts.requireOwnedContribution(request(subject), member.id)).rejects.toMatchObject({ status: subject ? 403 : 401 });
  }
  const invite = await accounts.inviteAdmin(request('owner'), 'later@example.com');
  await accounts.revokeInvitation(request('owner'), invite.id);
  expect((await accounts.readAudit(request('owner', 'GET'))).some((event) => event.action === 'invitation_revoked')).toBe(true);
  const response = await handleAdminWrite(new Request(`${origin}/api/accounts/admin`, { method: 'POST', headers: { Authorization: 'owner', Origin: origin }, body: new URLSearchParams({ action: 'remove', target: admin.id }) }), accounts, origin);
  expect(response.status).toBe(303);
  await expect(accounts.requireAdmin(request('admin', 'GET'))).rejects.toMatchObject({ status: 403 });
});

test('Clerk handshake returns SDK redirect and separate cookies before protected routing, never a guest identity', async () => {
  const headers = new Headers({ Location: 'https://clerk.example/handshake?return_url=https%3A%2F%2Frecipes.example%2Fonboarding' });
  headers.append('Set-Cookie', '__session=refreshed; Path=/; HttpOnly; Secure; SameSite=Lax');
  headers.append('Set-Cookie', '__client=client; Path=/; Expires=Thu, 01 Jan 2037 00:00:00 GMT; HttpOnly; Secure');
  const adapter = clerkModule.createClerkAdapter({
    authenticateRequest: async () => ({ status: 'handshake', headers, isAuthenticated: false, toAuth: () => ({ userId: null }) }),
    getUser: async () => { throw new Error('Handshake must not look up or map a member'); },
  });
  const incoming = request('', 'GET');
  const response = await handleAccountRequest(incoming, async () => new Response('Guest access denied', { status: 401 }), adapter);
  expect(response.status).toBe(307);
  expect(response.headers.get('Location')).toBe('https://clerk.example/handshake?return_url=https%3A%2F%2Frecipes.example%2Fonboarding');
  expect(response.headers.getSetCookie()).toEqual(['__session=refreshed; Path=/; HttpOnly; Secure; SameSite=Lax', '__client=client; Path=/; Expires=Thu, 01 Jan 2037 00:00:00 GMT; HttpOnly; Secure']);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.text()).toBe('');
  await expect(adapter.verifyIdentity(incoming)).rejects.toMatchObject({ response: { status: 307 } });
});

test('signed-out Clerk state still denies protected access and retains refresh cookies', async () => {
  const headers = new Headers();
  headers.append('Set-Cookie', '__session=; Max-Age=0; Path=/; HttpOnly');
  headers.append('Set-Cookie', '__client=refreshed; Path=/; HttpOnly');
  const adapter = clerkModule.createClerkAdapter({
    authenticateRequest: async () => ({ status: 'signed-out', headers, isAuthenticated: false, toAuth: () => ({ userId: null }) }),
    getUser: async () => { throw new Error('Signed-out must not look up a user'); },
  });
  const accounts = accountModule.createAccountService({ pool, origin, verifyIdentity: adapter.verifyIdentity });
  const incoming = request('', 'GET');
  const response = await handleAccountRequest(incoming, async () => {
    try { await accounts.requireActor(incoming); return new Response('Unexpected access'); }
    catch (error) { return new Response('Sign-in required', { status: error instanceof permissionModule.AccountError ? error.status : 503 }); }
  }, adapter);
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual(['__session=; Max-Age=0; Path=/; HttpOnly', '__client=refreshed; Path=/; HttpOnly']);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await pool.query('SELECT count(*)::int AS count FROM members')).rows[0].count).toBe(0);
});


test('contribution suspension does not block an owner invitation granting the matching staff role', async () => {
  const accounts = service();
  identity('owner', 'owner@example.com'); identity('invited');
  const invited = await accounts.updateProfile(request('invited'), { displayName: 'Invited staff' });
  await pool.query('UPDATE members SET suspended=true WHERE id=$1', [invited.id]);
  await accounts.inviteAdmin(request('owner'), 'invited@example.com');
  const actor = await accounts.requireAdmin(request('invited', 'GET'));
  expect(actor.role).toBe('admin');
  expect(permissionModule.canContribute(actor)).toBe(false);
});
