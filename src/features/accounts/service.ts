import type { Pool, PoolClient } from 'pg';
import { getPool, transaction } from '../../server/db';
import { accountConfiguration, verifyClerkIdentity } from '../../server/clerk';
import { AccountError, assertAdmin, assertOwner, assertSameOriginWrite, canContribute, type Actor } from './permissions';
export type { Actor } from './permissions';
export { canContribute } from './permissions';
export interface AuthIdentity { provider: 'clerk'; subject: string; email: string; emailVerified: boolean; }
interface Options { pool: Pool; origin: string; ownerBootstrapEmail?: string; verifyIdentity: (request: Request) => Promise<AuthIdentity | null>; }
interface MemberRow {
  id: string; role: Actor['role']; suspended: boolean; display_name: string | null; bio: string;
  avatar_asset_id: string | null; avatar_preset: Actor['avatarPreset']; saved_list_public: boolean; onboarded_at: Date | null; created_at?: Date;
}
const actorFrom = (row: MemberRow): Actor => ({ id: row.id, role: row.role, suspended: row.suspended, displayName: row.display_name, bio: row.bio, avatarPreset: row.avatar_preset, avatarAssetId: row.avatar_asset_id, savedListPublic: row.saved_list_public, onboarded: row.onboarded_at !== null, ...(row.created_at ? { memberSince: row.created_at.toISOString() } : {}) });
function emailAddress(value: unknown) {
  if (typeof value !== 'string' || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AccountError(400, 'A valid email is required');
  return value.trim().toLowerCase();
}
async function audit(client: PoolClient, actor: string, action: string, target: string) {
  await client.query('INSERT INTO account_audit (actor_id, action, target_id) VALUES ($1,$2,$3)', [actor, action, target]);
}
export function createAccountService(options: Options) {
  async function mapIdentity(client: PoolClient, identity: AuthIdentity) {
    if (!identity.emailVerified || identity.provider !== 'clerk' || !identity.subject) throw new AccountError(401, 'Verified sign-in required');
    const email = emailAddress(identity.email);
    // Serialize role transitions and invitation redemption with fresh authorization in this transaction.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('escalera:accounts:roles'))");
    const result = await client.query<MemberRow>(`INSERT INTO members (auth_provider,auth_subject,verified_email) VALUES ($1,$2,$3)
      ON CONFLICT (auth_provider,auth_subject) DO UPDATE SET verified_email=EXCLUDED.verified_email RETURNING *`, [identity.provider, identity.subject, email]);
    const row = result.rows[0];
    if (options.ownerBootstrapEmail && email === emailAddress(options.ownerBootstrapEmail)) {
      const binding = await client.query('INSERT INTO owner_binding (member_id) VALUES ($1) ON CONFLICT (singleton) DO NOTHING RETURNING member_id', [row.id]);
      if (binding.rowCount) {
        await client.query("UPDATE members SET role='owner' WHERE id=$1", [row.id]);
        row.role = 'owner';
        await audit(client, row.id, 'owner_bootstrapped', row.id);
      }
    }
    if (row.role === 'member') {
      const invite = await client.query(`UPDATE admin_invitations SET redeemed_by=$1, redeemed_at=now()
        WHERE id=(SELECT id FROM admin_invitations WHERE email=$2 AND redeemed_by IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at,id LIMIT 1 FOR UPDATE) RETURNING id,invited_by`, [row.id, email]);
      if (invite.rowCount) {
        await client.query("UPDATE members SET role='admin' WHERE id=$1", [row.id]);
        row.role = 'admin';
        await audit(client, invite.rows[0].invited_by, 'admin_granted', row.id);
      }
    }
    return actorFrom(row);
  }
  async function identify(request: Request) {
    const identity = await options.verifyIdentity(request);
    if (!identity) throw new AccountError(401, 'Sign-in required');
    return identity;
  }
  async function withActor<T>(request: Request, operation: (client: PoolClient, actor: Actor) => Promise<T>) {
    const identity = await identify(request);
    return transaction(options.pool, async (client) => operation(client, await mapIdentity(client, identity)));
  }
  const ensureMember = (identity: AuthIdentity) => transaction(options.pool, (client) => mapIdentity(client, identity));
  const requireActor = (request: Request) => withActor(request, async (_client, actor) => actor);
  const requireAdmin = (request: Request) => withActor(request, async (_client, actor) => { assertAdmin(actor); return actor; });
  const requireOwner = (request: Request) => withActor(request, async (_client, actor) => { assertOwner(actor); return actor; });
  return {
    ensureMember, requireActor, requireAdmin, requireOwner,
    async requireOwnedContribution(request: Request, ownerId: string) {
      assertSameOriginWrite(request, options.origin);
      return withActor(request, async (_client, actor) => {
        if (!canContribute(actor) || (actor.id !== ownerId && actor.role === 'member')) throw new AccountError(403, 'Contribution access denied');
        return actor;
      });
    },
    async updateProfile(request: Request, fields: Record<string, unknown>) {
      assertSameOriginWrite(request, options.origin);
      const name = typeof fields.displayName === 'string' ? fields.displayName.trim() : '';
      const bio = fields.bio === undefined ? '' : fields.bio;
      const avatar = fields.avatarPreset === undefined || fields.avatarPreset === '' ? null : fields.avatarPreset;
      if (!name || Array.from(name).length > 80 || typeof bio !== 'string' || Array.from(bio).length > 400 || (avatar !== null && !['chile', 'corn', 'lime'].includes(String(avatar)))) throw new AccountError(400, 'Check your display name, bio and avatar');
      const savedListPublic = fields.savedListPublic === undefined ? true : fields.savedListPublic === true || fields.savedListPublic === 'true';
      return withActor(request, async (client, actor) => {
        const result = await client.query<MemberRow>('UPDATE members SET display_name=$2,bio=$3,avatar_preset=$4,saved_list_public=$5,onboarded_at=COALESCE(onboarded_at,now()) WHERE id=$1 RETURNING *', [actor.id, name, bio, avatar, savedListPublic]);
        return actorFrom(result.rows[0]);
      });
    },
    async inviteAdmin(request: Request, value: unknown) {
      assertSameOriginWrite(request, options.origin);
      const email = emailAddress(value);
      return withActor(request, async (client, actor) => {
        assertOwner(actor);
        // One active invitation per email; revocation remains auditable.
        const revoked = await client.query('UPDATE admin_invitations SET revoked_at=now() WHERE email=$1 AND redeemed_by IS NULL AND revoked_at IS NULL RETURNING id', [email]);
        for (const row of revoked.rows) await audit(client, actor.id, 'invitation_revoked', row.id);
        const invite = await client.query<{ id: string }>('INSERT INTO admin_invitations (email,invited_by) VALUES ($1,$2) RETURNING id', [email, actor.id]);
        await audit(client, actor.id, 'admin_invited', invite.rows[0].id);
        return invite.rows[0];
      });
    },
    async revokeInvitation(request: Request, id: string) {
      assertSameOriginWrite(request, options.origin);
      return withActor(request, async (client, actor) => {
        assertOwner(actor);
        const result = await client.query('UPDATE admin_invitations SET revoked_at=now() WHERE id=$1 AND redeemed_by IS NULL AND revoked_at IS NULL RETURNING id', [id]);
        if (!result.rowCount) throw new AccountError(400, 'Pending invitation not found');
        await audit(client, actor.id, 'invitation_revoked', id);
      });
    },
    async removeAdmin(request: Request, targetId: string) {
      assertSameOriginWrite(request, options.origin);
      return withActor(request, async (client, actor) => {
        assertOwner(actor);
        const result = await client.query("UPDATE members SET role='member' WHERE id=$1 AND role='admin' RETURNING verified_email", [targetId]);
        if (!result.rowCount) throw new AccountError(400, 'Admin account not found');
        await client.query('UPDATE admin_invitations SET revoked_at=now() WHERE email=$1 AND revoked_at IS NULL', [result.rows[0].verified_email]);
        await audit(client, actor.id, 'admin_removed', targetId);
      });
    },
    async readAudit(request: Request) {
      return withActor(request, async (client, actor) => {
        assertOwner(actor);
        const result = await client.query<{ id: string; action: string; actor_id: string; target_id: string; created_at: Date }>("SELECT id,action,actor_id,target_id,created_at FROM account_audit WHERE created_at>now()-interval '1 year' ORDER BY created_at DESC,id LIMIT 100");
        return result.rows;
      });
    },
    async listAdministrators(request: Request) {
      return withActor(request, async (client, actor) => {
        assertOwner(actor);
        const members = await client.query<{ id: string; display_name: string | null }>("SELECT id,display_name FROM members WHERE role='admin' ORDER BY id LIMIT 100");
        const invitations = await client.query<{ id: string; email: string; expires_at: Date }>('SELECT id,email,expires_at FROM admin_invitations WHERE redeemed_by IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC,id LIMIT 100');
        return { members: members.rows, invitations: invitations.rows };
      });
    },
  };
}
export function accounts() {
  const config = accountConfiguration();
  if (!config) throw new AccountError(503, 'Sign-in is temporarily unavailable');
  return createAccountService({ pool: getPool(), origin: config.origin, ownerBootstrapEmail: config.ownerBootstrapEmail, verifyIdentity: verifyClerkIdentity });
}
export const requireActor = (request: Request): Promise<Actor> => accounts().requireActor(request);
export const ensureMember = (identity: AuthIdentity): Promise<Actor> => accounts().ensureMember(identity);
