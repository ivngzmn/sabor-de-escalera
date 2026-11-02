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

## Not built yet

- Attaching images with credits to ownerless recipes.
- Admin correction of staged text, category, origin and baseline. That is main-plan Task 9.

Until both exist, and until the production image service passes `media-proof.md`, no imported recipe can meet the publication rules.
