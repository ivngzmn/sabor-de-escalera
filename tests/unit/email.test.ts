import { expect, test } from 'vitest';
import { createEmailAdapter, renderEmail } from '../../src/features/notifications/email';
import type { EmailRecord, SendStore, SendStatus } from '../../src/features/notifications/email';

function fixture() {
  const records = new Map<string, SendStatus>();
  const inbox = new Map([['reference-1', 'protected full report text']]);
  let requests = 0;
  let suspended = false; let preference = true; let suppressed = false;
  const store: SendStore = {
    enqueue: async (record) => { if (!records.has(record.id)) records.set(record.id, 'pending'); },
    claim: async (id) => { const status = records.get(id)!; if (status === 'sending' || status === 'sent') return { status }; records.set(id, 'sending'); return { status: 'sending', claimed: true }; },
    eligibility: async () => ({ email: 'member@example.com', suspended, preference, suppressed }),
    finish: async (id, status) => { records.set(id, status); },
  };
  const record: EmailRecord = { id: 'send-1', recipientId: 'member-1', kind: 'admin-alert', category: 'report', reference: 'reference-1', occurredAt: '2026-10-12T00:00:00Z' };
  const fetcher: typeof fetch = async () => { requests++; throw new Error('provider unavailable private detail'); };
  return { store, record, records, inbox, fetcher, requests: () => requests, suspend: () => { suspended = true; }, optOut: () => { preference = false; }, suppress: () => { suppressed = true; } };
}

test('disabled flag and enabled member gate send zero requests while retaining durable request', async () => {
  for (const enabled of [false, true]) {
    const f = fixture();
    const adapter = createEmailAdapter({ store: f.store, enabled, origin: 'https://recipes.example', fetcher: f.fetcher });
    expect(await adapter.sendEmail(f.record)).toEqual({ ok: true, value: 'disabled' });
    expect(f.requests()).toBe(0); expect(f.records.get('send-1')).toBe('pending'); expect(f.inbox.size).toBe(1);
  }
});

test('test delivery failure retains inbox and durable retry status without provider details', async () => {
  const f = fixture();
  const adapter = createEmailAdapter({ store: f.store, enabled: false, origin: 'https://recipes.example', fetcher: f.fetcher, testDelivery: { runtime: 'test', apiKey: 'fixture', from: 'test@example.com', to: 'delivered@resend.dev' } });
  expect(await adapter.sendEmail(f.record)).toEqual({ ok: false, error: 'Email delivery failed; request retained' });
  expect(f.records.get('send-1')).toBe('failed'); expect(f.inbox.get('reference-1')).toBe('protected full report text');
  await adapter.sendEmail(f.record); expect(f.requests()).toBe(2);
});

test('test delivery rechecks suspension, preferences and suppression immediately before sending', async () => {
  for (const block of ['suspend', 'optOut', 'suppress'] as const) {
    const f = fixture(); f[block]();
    const adapter = createEmailAdapter({ store: f.store, enabled: false, origin: 'https://recipes.example', fetcher: f.fetcher, testDelivery: { runtime: 'test', apiKey: 'fixture', from: 'test@example.com', to: 'delivered@resend.dev' } });
    expect(await adapter.sendEmail(f.record)).toEqual({ ok: true, value: 'suppressed' }); expect(f.requests()).toBe(0);
  }
});

test('production cannot use test delivery; concurrent claims and retries reuse durable provider key', async () => {
  const f = fixture(); const payloads: string[] = []; const keys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => { payloads.push(String(init?.body)); keys.push(new Headers(init?.headers).get('Idempotency-Key')!); return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 }); };
  const adapter = createEmailAdapter({ store: f.store, enabled: true, origin: 'https://recipes.example', fetcher, testDelivery: { runtime: 'test', apiKey: 'fixture', from: 'test@example.com', to: 'delivered@resend.dev' } });
  await Promise.all([adapter.sendEmail(f.record), adapter.sendEmail(f.record)]);
  expect(payloads).toHaveLength(1); expect(keys).toEqual(['send-1']); expect(payloads[0]).toContain('delivered@resend.dev'); expect(payloads[0]).not.toContain('member@example.com');
  expect(f.records.get('send-1')).toBe('sent');
  expect(() => createEmailAdapter({ store: f.store, enabled: true, origin: 'https://recipes.example', testDelivery: { runtime: 'production', apiKey: 'x', from: 'x', to: 'delivered@resend.dev' } })).toThrow('Test delivery');
});

test('safe templates contain category, time, reference and protected link only', () => {
  const f = fixture();
  const output = renderEmail({ ...f.record, reference: '<img src=x>' }, 'https://recipes.example');
  expect(output.html).not.toContain('<img'); expect(output.text).toContain('2026-10-12'); expect(output.text).toContain('https://recipes.example/admin');
});
