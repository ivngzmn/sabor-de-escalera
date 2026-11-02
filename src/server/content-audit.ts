import type { PoolClient } from 'pg';

export type ContentAuditAction = 'cookbook_text_reviewed' | 'cookbook_published' | 'translation_saved' | 'translation_approved';

/** Records an admin content action inside the caller's transaction. Details hold ids and versions, never recipe text. */
export async function recordContentAudit(client: PoolClient, actorId: string, action: ContentAuditAction, targetId: string, details: Record<string, string | number> = {}) {
  await client.query('INSERT INTO content_audit (actor_id, action, target_id, details) VALUES ($1,$2,$3,$4)', [actorId, action, targetId, JSON.stringify(details)]);
}
