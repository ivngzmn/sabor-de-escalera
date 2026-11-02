-- Catalog read model: denormalized from recipes.input and approved translations by refreshCatalogRow.
ALTER TABLE recipes
 ADD COLUMN search_text text NOT NULL DEFAULT '',
 ADD COLUMN title_keys text[] NOT NULL DEFAULT '{}',
 ADD COLUMN category text,
 ADD COLUMN origin text,
 ADD COLUMN total_minutes integer,
 ADD COLUMN dietary text[] NOT NULL DEFAULT '{}',
 ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','es'));
CREATE INDEX recipes_catalog_category ON recipes(category,first_published_at DESC,id) WHERE state='published';
-- Favorites outlive visibility changes so restored recipes keep their savers.
CREATE TABLE recipe_favorites (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 recipe_id uuid NOT NULL REFERENCES recipes(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (member_id,recipe_id)
);
CREATE INDEX recipe_favorites_recipe ON recipe_favorites(recipe_id);
-- Rating writes arrive with the community slice; discovery only reads aggregates.
CREATE TABLE recipe_ratings (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 recipe_id uuid NOT NULL REFERENCES recipes(id),
 stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (member_id,recipe_id)
);
CREATE INDEX recipe_ratings_recipe ON recipe_ratings(recipe_id);
CREATE TABLE recipe_translations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipe_id uuid NOT NULL REFERENCES recipes(id),
 language text NOT NULL CHECK (language IN ('en','es')),
 source_version integer NOT NULL CHECK (source_version>0),
 status text NOT NULL CHECK (status IN ('proposed','approved','outdated')),
 input jsonb NOT NULL,
 edited_by uuid REFERENCES members(id),
 approved_by uuid REFERENCES members(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recipe_translations_one_approved ON recipe_translations(recipe_id,language) WHERE status='approved';
