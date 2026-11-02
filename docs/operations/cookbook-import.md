# Cookbook import and review

## Where the book text lives

The repository is public. Book text and images are **never committed**. The source PDF and the transcribed manifest stay under `reference/` (gitignored), for example `reference/cookbook/manifest.json`. Tests use `tests/fixtures/cookbook-sample.json`, which contains invented dishes only.

Being included in the printed book does not grant permission to reuse its text or photos on the web. Every published image needs a recorded source and permission (`photo_credits`). Credit alone is not permission.

## Manifest format

The manifest is a JSON array with one entry per recipe, validated by `parseManifest` (`src/features/cookbook/manifest.ts`):

| Field | Meaning |
|---|---|
| `key` | Stable id, lowercase letters, digits and dashes, e.g. `p12-sopa-de-fideo`. Re-imports match on it. |
| `pages` | Book page numbers. |
| `contributor`, `originalAuthor` | Historical credit exactly as printed, or `null`. Kept apart from the owning account. |
| `sourceUrls` | Printed source or video links (http/https only). |
| `language` | `en` or `es`: the language the recipe is written in. |
| `flags` | Every uncertainty, e.g. `yield-unclear`, `quantity-unclear:<row>`, `category-unassigned`, `origin-unassigned`, `timing-missing`. |
| `recipe` | The recipe text: title, ingredients (with sections), instructions, yield, timing, story, notes. Photos and a confirmed scaling baseline are rejected; people add those during review. |

Transcription rules:
- Correct obvious spelling and formatting only.
- Never infer category, origin, yield, times, quantities or photos. Leave the field empty and add a flag instead.

## Import

```bash
pnpm cookbook:import reference/cookbook/manifest.json
```

- **What it creates:** every entry becomes an ownerless, unpublished recipe plus a `cookbook_entries` row.
- **Re-running:** unchanged entries are skipped, and changed entries are updated. Entries whose text an admin already marked reviewed are never overwritten; the run reports them as "kept".
- **Non-local databases:** the CLI refuses unless you pass `--confirm-backup`. Take a database backup first. Automated backups are main-plan Task 11.

## Review

`/admin/cookbook` lists every entry with its pages, text and image review state, translation state, what's still needed and its flags. An entry can be published from its review page only when all of these hold:

1. It passes the same publication checks as member recipes: category, origin, yield, a confirmed scaling baseline, timing, 1–6 captioned photos, and the ingredient and step limits.
2. Its text review is approved.
3. Its image review is approved.
4. Every photo is a ready recipe asset with a `photo_credits` row.

Published cookbook recipes have no owning account. Readers see "From the Escalera cookbook", plus the contributor and original author when the book names them.

Translations are reviewed by hand at `/admin/translations/<recipeId>`. A translation is bound to the recipe version it was written against. Approving it after the recipe has changed fails, and editing the recipe marks its approved translation as outdated. `AUTO_TRANSLATION_ENABLED` stays `false`, and nothing here calls a translation provider.

## Staging status (November 1, 2026)

The whole book is transcribed into the local manifest: 40 recipes covering every printed recipe page (3–42). There are 10 appetizers and sides, 4 beverages, 21 main dishes and 5 desserts; categories follow the book's table of contents. All 40 imported cleanly into a local database as unpublished, ownerless recipes. None is published, and none can be yet.

What blocks publication, counted across the 40 recipes:

| Blocker | Recipes |
|---|---|
| Text review not done | 40 |
| No images (image review missing) | 40 |
| Origin not set (the book doesn't state one) | 40 |
| Serving baseline not confirmed (needs a person) | 40 |
| No single total time (printed as a range, prep only, or missing) | 11 |
| No yield printed | 1 |

Transcription flags for reviewers. These are counts of flags, and a recipe can carry several:

| Flag | Count | Meaning |
|---|---|---|
| `third-party-source` | 16 | Adapted from a website the book cites; check reuse permission. |
| `timing-range` | 8 | The book prints a range; the printed text is kept in the notes. |
| `unit-missing` | 6 | A quantity is printed without a unit. |
| `ingredient-missing` | 5 | A step uses something the ingredient list doesn't include. |
| `quantity-unclear` / `quantity-check` / `quantity-missing` | 2 / 2 / 1 | A printed amount looks wrong or is absent. |
| `step-unclear` | 2 | A printed step is garbled. |
| `ingredient-unused` | 2 | A listed ingredient never appears in the steps. |
| `title-spelling-check` | 2 | An obvious title misspelling was corrected; confirm it. |
| `source-url-mismatch` / `source-url-missing` | 1 / 1 | The cited link belongs to another recipe, or no link is given. |
| `contributor-missing` / `original-author-blank` | 1 / 1 | The book gives no contributor, or a blank original author. |
| `timing-prep-only` / `timing-excludes-soak` / `timing-missing` / `yield-missing` | 1 each | Timing or yield is incomplete as printed. |
| `metric-amounts-unscaled` | 1 | Gram amounts inside ingredient names won't change when a reader scales. |

## Not built yet

- Attaching images with credits to ownerless recipes.
- Admin correction of staged text, category, origin and baseline. That is main-plan Task 9.

Until both exist, and until the production image service passes `media-proof.md`, no imported recipe can meet the publication rules.
