import type { Actor } from '../features/accounts/permissions';
import { accountConfiguration, getClerkAdapter } from './clerk';
import { getPool } from './db';
export type HeaderIdentity = Pick<Actor, 'id' | 'role' | 'onboarded' | 'displayName' | 'avatarPreset'> & { avatarAssetId: string | null };
// Clerk's non-secret __client_uat cookie is a timestamp when a session exists and 0 when signed out.
export function hasSessionHint(request: Request) {
  return (request.headers.get('cookie') ?? '').split(';').some((cookie) => {
    const [name, value] = cookie.trim().split('=');
    return /^__client_uat(?:_[\w-]+)?$/.test(name) && Number(value) > 0;
  });
}
/**
 * Read-only member summary for the site header, so the account menu renders
 * complete on every page. Authorization still happens per account route;
 * any failure returns null and the client island fetches /api/accounts/me.
 */
export async function readHeaderIdentity(request: Request): Promise<HeaderIdentity | null> {
  if (!accountConfiguration() || !hasSessionHint(request)) return null;
  try {
    const subject = await getClerkAdapter().sessionSubject(request);
    if (!subject) return null;
    const row = (await getPool().query<{ id: string; role: Actor['role']; onboarded_at: Date | null; display_name: string | null; avatar_asset_id: string | null; avatar_preset: Actor['avatarPreset'] }>(
      "SELECT id,role,onboarded_at,display_name,avatar_asset_id,avatar_preset FROM members WHERE auth_provider='clerk' AND auth_subject=$1",
      [subject],
    )).rows[0];
    return row ? { id: row.id, role: row.role, onboarded: row.onboarded_at !== null, displayName: row.display_name, avatarAssetId: row.avatar_asset_id, avatarPreset: row.avatar_preset } : null;
  } catch { return null; }
}
