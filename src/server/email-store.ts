import type { Pool } from 'pg';
import type { EmailKind, EmailRecord, SendStatus, SendStore } from './email';
export function createPostgresSendStore(pool: Pool): SendStore & { suppress(email: string): Promise<void> } {
  return {
    async enqueue(record: EmailRecord) {
      // Identity reuse with changed metadata fails closed rather than modifying
      // a provider idempotency payload. Caller commits inbox before delivery.
      const result = await pool.query(`INSERT INTO email_sends(id,recipient_id,kind,category,reference,occurred_at) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET id=email_sends.id WHERE email_sends.recipient_id=EXCLUDED.recipient_id AND email_sends.kind=EXCLUDED.kind AND email_sends.category=EXCLUDED.category AND email_sends.reference=EXCLUDED.reference AND email_sends.occurred_at=EXCLUDED.occurred_at RETURNING id`, [record.id, record.recipientId, record.kind, record.category, record.reference, record.occurredAt]);
      if (!result.rowCount) throw new Error('Send identity conflicts with durable record');
    },
    async claim(id: string) {
      // Retry within Resend's 24h idempotency lifetime, at most five attempts.
      // No timed takeover of sending: crashes require provider reconciliation.
      const result = await pool.query(`UPDATE email_sends SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,now()),updated_at=now()
        WHERE id=$1 AND status IN ('pending','failed') AND attempts<5 AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours') RETURNING status`, [id]);
      if (result.rowCount) return { status: 'sending', claimed: true };
      const existing = await pool.query<{ status: SendStatus }>('SELECT status FROM email_sends WHERE id=$1', [id]);
      if (!existing.rowCount) throw new Error('Durable send not found');
      return { status: existing.rows[0].status };
    },
    async eligibility(recipientId: string, kind: EmailKind) {
      const result = await pool.query(`SELECT m.verified_email AS email,m.suspended,COALESCE(p.enabled,false) AS preference,EXISTS(SELECT 1 FROM email_suppressions s WHERE s.email=lower(m.verified_email)) AS suppressed
        FROM members m LEFT JOIN email_preferences p ON p.member_id=m.id AND p.kind=$2 WHERE m.id=$1`, [recipientId, kind]);
      return result.rows[0] ?? { email: '', suspended: true, preference: false, suppressed: true };
    },
    async finish(id, status) {
      const result = await pool.query("UPDATE email_sends SET status=$2,updated_at=now() WHERE id=$1 AND status='sending' RETURNING id", [id, status]);
      if (!result.rowCount) throw new Error('Durable send is not claimed');
    },
    async suppress(email) { await pool.query('INSERT INTO email_suppressions(email) VALUES($1) ON CONFLICT DO NOTHING', [email.trim().toLowerCase()]); },
  };
}
