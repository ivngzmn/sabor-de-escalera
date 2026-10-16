-- Notification inboxes remain independent: this ledger never owns request data.
CREATE TABLE email_sends (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 128),
  recipient_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('admin-alert','acknowledgment','resolution')),
  category text NOT NULL CHECK (category IN ('report','support')),
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 1 AND 100),
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','suppressed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  first_attempt_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id,kind,reference)
);
CREATE INDEX email_sends_pending ON email_sends (updated_at,id) WHERE status IN ('pending','failed');
CREATE TABLE email_preferences (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('admin-alert','acknowledgment','resolution')),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(member_id,kind)
);
CREATE TABLE email_suppressions (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
