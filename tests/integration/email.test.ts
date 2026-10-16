import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { migrate } from '../../src/server/db';
import { createPostgresSendStore } from '../../src/server/email-store';

const url = process.env.TEST_DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Email tests require local TEST_DATABASE_URL');
const schema = `email_${randomUUID().replaceAll('-', '')}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
let member: string;
beforeAll(async () => { await root.query(`CREATE SCHEMA ${schema}`); await migrate(pool); member = (await pool.query("INSERT INTO members(auth_provider,auth_subject,verified_email) VALUES('clerk','email-test','member@example.com') RETURNING id")).rows[0].id; });
beforeEach(async () => { await pool.query('TRUNCATE email_sends,email_preferences,email_suppressions'); await pool.query('UPDATE members SET suspended=false,verified_email=$2 WHERE id=$1', [member, 'member@example.com']); });
afterAll(async () => { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); });

test('durable enqueue deduplicates; concurrent claims send once and failed attempts can retry', async () => {
  const store = createPostgresSendStore(pool);
  const record = { id: 'durable-send', recipientId: member, kind: 'admin-alert' as const, category: 'report' as const, reference: 'report-1', occurredAt: '2026-10-12T00:00:00Z' };
  await Promise.all([store.enqueue(record), store.enqueue(record)]);
  expect((await pool.query('SELECT count(*)::int AS count FROM email_sends')).rows[0].count).toBe(1);
  const claims = await Promise.all(Array.from({ length: 5 }, () => store.claim(record.id)));
  expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
  await store.finish(record.id, 'failed');
  expect((await store.claim(record.id)).claimed).toBe(true);
  await store.finish(record.id, 'sent'); expect((await store.claim(record.id)).claimed).toBeFalsy();
  await expect(store.enqueue({ ...record, reference: 'different' })).rejects.toThrow();
  await expect(store.enqueue({ ...record, id: 'different-key' })).rejects.toThrow();
});

test('eligibility reads current email, suspension, preference and bounced suppression', async () => {
  const store = createPostgresSendStore(pool);
  expect(await store.eligibility(member, 'resolution')).toMatchObject({ suspended: false, preference: false, suppressed: false });
  await pool.query("INSERT INTO email_preferences(member_id,kind,enabled) VALUES($1,'resolution',true)", [member]);
  expect((await store.eligibility(member, 'resolution')).preference).toBe(true);
  await pool.query('UPDATE members SET suspended=true,verified_email=$2 WHERE id=$1', [member, 'changed@example.com']);
  await store.suppress('changed@example.com');
  expect(await store.eligibility(member, 'resolution')).toMatchObject({ email: 'changed@example.com', suspended: true, preference: true, suppressed: true });
  expect(await store.eligibility(randomUUID(), 'resolution')).toMatchObject({ suspended: true, preference: false, suppressed: true });
});

test('provider failure preserves a separately committed inbox and durable failed send', async () => {
  const { createEmailAdapter } = await import('../../src/features/notifications/email');
  await pool.query('CREATE TABLE fixture_inbox(id text PRIMARY KEY, private_text text NOT NULL)');
  await pool.query("INSERT INTO fixture_inbox VALUES('support-1','private support details')");
  await pool.query('UPDATE members SET suspended=false WHERE id=$1', [member]);
  const store = createPostgresSendStore(pool);
  const adapter = createEmailAdapter({ store, enabled: false, origin: 'https://recipes.example', testDelivery: { runtime: 'test', apiKey: 'fixture', from: 'onboarding@resend.dev', to: 'delivered@resend.dev' }, fetcher: async () => new Response('failed', { status: 503 }) });
  await pool.query("INSERT INTO email_preferences(member_id,kind,enabled) VALUES($1,'resolution',true)", [member]);
  await pool.query("INSERT INTO fixture_inbox VALUES('support-2','retained private text')");
  expect(await adapter.sendEmail({ id: 'failed-support-2', recipientId: member, kind: 'resolution', category: 'support', reference: 'support-2', occurredAt: '2026-10-12T00:00:00Z' })).toMatchObject({ ok: false });
  expect((await pool.query("SELECT status FROM email_sends WHERE id='failed-support-2'")).rows[0].status).toBe('failed');
  expect((await pool.query("SELECT private_text FROM fixture_inbox WHERE id='support-2'")).rows[0].private_text).toBe('retained private text');
});

test('retry attempts stay bounded and expired or in-flight sends require reconciliation', async () => {
  const store = createPostgresSendStore(pool);
  const record = { id: 'bounded', recipientId: member, kind: 'resolution' as const, category: 'support' as const, reference: 'bounded-ref', occurredAt: '2026-10-12T00:00:00Z' };
  await store.enqueue(record);
  for (let attempt = 0; attempt < 5; attempt++) { expect((await store.claim(record.id)).claimed).toBe(true); await store.finish(record.id, 'failed'); }
  expect((await store.claim(record.id)).claimed).toBeFalsy();
  await store.enqueue({ ...record, id: 'expired', reference: 'expired-ref' });
  await pool.query("UPDATE email_sends SET status='failed',attempts=1,first_attempt_at=now()-interval '24 hours' WHERE id='expired'");
  expect((await store.claim('expired')).claimed).toBeFalsy();
  await store.enqueue({ ...record, id: 'in-flight', reference: 'in-flight-ref' });
  expect((await store.claim('in-flight')).claimed).toBe(true);
  await pool.query("UPDATE email_sends SET first_attempt_at=now()-interval '24 hours' WHERE id='in-flight'");
  expect(await store.claim('in-flight')).toEqual({ status: 'sending' });
});
