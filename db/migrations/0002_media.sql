-- Upload credentials are issued only after an intent commits. Intent rows also
-- form a durable rolling rate ledger (no raw IP addresses or filenames).
CREATE TABLE upload_intents (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES members(id),
  purpose text NOT NULL CHECK (purpose IN ('recipe','cooking','avatar')),
  input_mime text NOT NULL CHECK (input_mime IN ('image/jpeg','image/png','image/webp')),
  input_size integer NOT NULL CHECK (input_size BETWEEN 1 AND 20000000),
  provider_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz
);
CREATE INDEX upload_intents_rate ON upload_intents(owner_id,created_at);
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL UNIQUE REFERENCES upload_intents(id),
  owner_id uuid NOT NULL REFERENCES members(id),
  purpose text NOT NULL CHECK (purpose IN ('recipe','cooking','avatar')),
  provider_file_id text NOT NULL UNIQUE,
  provider_path text NOT NULL UNIQUE,
  stored_bytes integer NOT NULL CHECK (stored_bytes BETWEEN 1 AND 2000000),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 2400),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 2400),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','hidden','deleting','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  purge_request_id text,
  cleanup_attempts integer NOT NULL DEFAULT 0,
  cleanup_requested_at timestamptz
);
-- Future recipe/cooking references must be changed in the content transaction,
-- locking the asset row and validating ownership/purpose/state. A saved draft
-- reference never expires. Reference IDs are internal content UUIDs.
CREATE TABLE media_references (
  asset_id uuid NOT NULL REFERENCES media_assets(id),
  kind text NOT NULL CHECK (kind IN ('avatar','recipe','cooking')),
  reference_id uuid NOT NULL,
  PRIMARY KEY (asset_id,kind,reference_id)
);
CREATE INDEX media_reference_target ON media_references(kind,reference_id);
ALTER TABLE members ADD COLUMN avatar_asset_id uuid REFERENCES media_assets(id);
CREATE INDEX media_cleanup ON media_assets(state,cleanup_requested_at);
