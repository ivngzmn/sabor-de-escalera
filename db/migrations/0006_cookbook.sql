-- Book recipes are staged as ownerless drafts; historical credit lives here, apart from the owning account.
CREATE TABLE cookbook_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 import_key text NOT NULL UNIQUE CHECK (import_key ~ '^[a-z0-9-]{1,120}$'),
 recipe_id uuid NOT NULL UNIQUE REFERENCES recipes(id),
 book_pages integer[] NOT NULL,
 contributor text,
 original_author text,
 source_urls text[] NOT NULL DEFAULT '{}',
 flags text[] NOT NULL DEFAULT '{}',
 text_review text NOT NULL DEFAULT 'pending' CHECK (text_review IN ('pending','approved')),
 image_review text NOT NULL DEFAULT 'missing' CHECK (image_review IN ('missing','pending','approved')),
 image_notes text NOT NULL DEFAULT '',
 manifest_hash text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES members(id),
 reviewed_at timestamptz
);
-- Filled when an owner-permitted, licensed stock or approved AI image is attached; attribution alone is not permission.
CREATE TABLE photo_credits (
 asset_id uuid PRIMARY KEY REFERENCES media_assets(id),
 kind text NOT NULL CHECK (kind IN ('owner','stock','ai')),
 photographer text,
 source_url text,
 license text,
 retrieved_on date,
 cropping text,
 label text NOT NULL DEFAULT 'none' CHECK (label IN ('none','illustrative','ai-illustrative'))
);
