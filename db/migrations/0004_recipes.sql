CREATE TABLE recipe_origins (
 id text PRIMARY KEY, label_en text NOT NULL, label_es text NOT NULL, active boolean NOT NULL DEFAULT true
);
INSERT INTO recipe_origins(id,label_en,label_es) VALUES
 ('not-sure','Not sure','No estoy seguro/a'),('fusion','Fusion / Multiple regions','Fusión / Varias regiones');
ALTER TABLE members ADD COLUMN draft_generation integer NOT NULL DEFAULT 1;
CREATE TABLE recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid REFERENCES members(id),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','unpublished','hidden','deleted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 generation integer NOT NULL,
 input jsonb NOT NULL,
 slug text,
 first_published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_saved_at timestamptz,
 deleted_at timestamptz
);
CREATE INDEX recipes_owner ON recipes(owner_id,state,updated_at DESC,id);
CREATE INDEX recipes_public ON recipes(first_published_at DESC,id) WHERE state='published';
-- A deletion is permanent to recovery even when lifecycle restoration is possible.
CREATE TABLE draft_tombstones (
 draft_id uuid PRIMARY KEY, owner_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recipe_publications (
 recipe_id uuid NOT NULL REFERENCES recipes(id), owner_id uuid NOT NULL REFERENCES members(id), published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipe_publications_rate ON recipe_publications(owner_id,published_at);
