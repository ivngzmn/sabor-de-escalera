import { readServerConfig } from './config';
import { getPool } from './db';
import { createPostgresSendStore } from './email-store';
export type EmailKind = 'admin-alert' | 'acknowledgment' | 'resolution';
export interface EmailRecord { id: string; recipientId: string; kind: EmailKind; category: 'report' | 'support'; reference: string; occurredAt: string; }
export type SendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'suppressed' | 'disabled';
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface SendStore {
  enqueue(record: EmailRecord): Promise<void>;
  claim(id: string): Promise<{ status: SendStatus; claimed?: boolean }>;
  eligibility(recipientId: string, kind: EmailKind): Promise<{ email: string; suspended: boolean; preference: boolean; suppressed: boolean }>;
  finish(id: string, status: 'sent' | 'failed' | 'suppressed'): Promise<void>;
}
interface Options {
  store: SendStore; enabled: boolean; origin: string; fetcher?: typeof fetch;
  testDelivery?: { runtime: string; apiKey: string; from: string; to: string };
}
const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
function validate(record: EmailRecord) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(record.id) || !record.recipientId || !['admin-alert', 'acknowledgment', 'resolution'].includes(record.kind) || !['report', 'support'].includes(record.category) || typeof record.reference !== 'string' || record.reference.length < 1 || record.reference.length > 100 || /[\r\n]/.test(record.reference) || !Number.isFinite(Date.parse(record.occurredAt))) throw new Error('Invalid email record');
}
export function renderEmail(record: EmailRecord, origin: string) {
  validate(record);
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.origin !== origin) throw new Error('Email links require configured HTTPS origin');
  const subject = { 'admin-alert': 'New private request', acknowledgment: 'Request received', resolution: 'Request updated' }[record.kind];
  const link = new URL(record.kind === 'admin-alert' ? '/admin' : '/notifications', base);
  link.searchParams.set('reference', record.reference);
  const text = `${subject}\nCategory: ${record.category}\nTime: ${new Date(record.occurredAt).toISOString()}\nReference: ${record.reference}\nView securely: ${link.href}`;
  return { subject, text, html: `<p>${escapeHtml(text).replaceAll('\n', '<br>')}</p>` };
}
export function createEmailAdapter(options: Options) {
  const delivery = options.testDelivery;
  // Runtime guard and provider's synthetic recipient both required. No public
  // endpoint, environment flag, or production recipient can activate this path.
  if (delivery && (process.env.NODE_ENV !== 'test' || delivery.runtime !== 'test' || delivery.to !== 'delivered@resend.dev')) throw new Error('Test delivery requires a test runtime and synthetic recipient');
  return {
    async sendEmail(record: EmailRecord): Promise<Result<SendStatus>> {
      let accepted = false; let claimed = false;
      try {
        validate(record);
        await options.store.enqueue(record);
        // Member delivery remains hard blocked until independent live proof.
        if (!delivery) return { ok: true, value: 'disabled' };
        const claim = await options.store.claim(record.id);
        if (!claim.claimed) return { ok: true, value: claim.status };
        claimed = true;
        const recipient = await options.store.eligibility(record.recipientId, record.kind);
        if (recipient.suspended || !recipient.preference || recipient.suppressed) {
          await options.store.finish(record.id, 'suppressed'); return { ok: true, value: 'suppressed' };
        }
        const response = await (options.fetcher ?? fetch)('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${delivery.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': record.id },
          body: JSON.stringify({ from: delivery.from, to: [delivery.to], ...renderEmail(record, options.origin) }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Provider request failed');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !body.id) throw new Error('Invalid provider response');
        accepted = true;
        await options.store.finish(record.id, 'sent');
        return { ok: true, value: 'sent' };
      } catch {
        // Accepted-but-unrecorded sends remain in-flight for reconciliation;
        // never overwrite them with a retriable failure or remove the inbox.
        if (claimed && !accepted) { try { await options.store.finish(record.id, 'failed'); } catch { /* Ledger needs reconciliation. */ } }
        return { ok: false, error: 'Email delivery failed; request retained' };
      }
    },
  };
}
export async function sendEmail(record: EmailRecord): Promise<Result<SendStatus>> {
  try { return await createEmailAdapter({ store: createPostgresSendStore(getPool()), enabled: readServerConfig().emailNotificationsEnabled, origin: process.env.APP_ORIGIN ?? '' }).sendEmail(record); }
  catch { return { ok: false, error: 'Email delivery failed; request retained' }; }
}
