CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider text NOT NULL CHECK (auth_provider = 'clerk'),
  auth_subject text NOT NULL,
  verified_email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
  suspended boolean NOT NULL DEFAULT false,
  display_name text CHECK (char_length(display_name) BETWEEN 1 AND 80),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 400),
  avatar_preset text CHECK (avatar_preset IN ('chile', 'corn', 'lime')),
  saved_list_public boolean NOT NULL DEFAULT true,
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, auth_subject)
);
CREATE INDEX members_verified_email ON members (verified_email);
CREATE UNIQUE INDEX one_owner ON members ((role)) WHERE role = 'owner';
-- This binding survives verified email changes and must never be recycled at signup.
CREATE TABLE owner_binding (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  member_id uuid NOT NULL UNIQUE REFERENCES members(id)
);
CREATE TABLE admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  redeemed_by uuid REFERENCES members(id),
  redeemed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX admin_invitations_pending ON admin_invitations (email) WHERE redeemed_by IS NULL AND revoked_at IS NULL;
CREATE TABLE account_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES members(id),
  action text NOT NULL CHECK (action IN ('owner_bootstrapped', 'admin_invited', 'admin_granted', 'admin_removed', 'invitation_revoked')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_audit_created ON account_audit (created_at DESC, id);
