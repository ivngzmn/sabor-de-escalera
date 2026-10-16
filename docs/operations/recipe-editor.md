# Recipe authoring and shared UI contracts

## Authoring boundary

`0004_recipes.sql` follows the existing accounts/media/email migrations. Never renumber applied migrations. `createDraftService({pool, disposeUnusedAsset})` exposes immediate empty-draft creation, owner-only reads/listing, `saveDraft(actor,id,expectedVersion,input)`, explicit separate-copy creation, deletion, and `publishRecipe(actor,id,expectedVersion)`. Results contain `{ok,value}` or `{ok:false,error:{status,message,fields?,retryAfter?}}`. Field errors identify a step (0–3) and field path for focus. An empty title is stored as empty author text and displayed as Untitled recipe.

Actors come only from the verified request boundary. Service transactions lock and re-read member suspension/onboarding and recipe ownership; role claims cannot authorize another author's draft. Draft POST/DELETE operations require exact Origin; JSON bodies are bounded to 300,000 bytes and allowlisted recursively. Optional HTTP(S) video URLs reject credentials, script/data schemes and protocol-relative URLs. Author HTML-looking text is stored as plain text and context-escaped by React/Astro. No raw draft logging.

Saved drafts have no expiration. Database versions reject stale writes with 409. A stale version can be loaded explicitly or its current client work saved to another internal ID only while the original draft is still live in the same account generation. Unchanged writes do not increment versions. Changed saves are limited to one per five seconds per draft, with visible waiting/retry. Publication requires all details, a confirmed numeric scaling baseline, positive total or prep/cook timing, 1–6 captioned owned verified photos, at most 100 ingredient/section rows and 50 instruction/section rows. Captions and alt text are bounded to 400 Unicode characters. Fractions, ranges and ambiguous quantities remain author text. Publishing has transactional per-account 5/hour and 20/day ledgers. Retain ledgers for at least the longest rate window before cleanup.

Typing during a pending separate-copy request stays in the editor and is rebased onto the new draft for autosave and consented recovery. Copy, deletion, latest-version loading and publication transport failures show a visible error with the action to retry. An uncertain publication response triggers an authenticated state read; an already committed publication opens the success actions without creating a second publication.

Origin choices come from `recipe_origins` (active rows); this migration includes only the genuine interface options Not sure and Fusion / Multiple regions. Later authorized origin administration manages this table. No country origins or recipe facts are inferred or seeded.

## Account lifecycle integration

`resetDraftsInTransaction(client, memberId)` is an **internal server hook**, not a public route or authorization bypass. The caller must authenticate and authorize reset/deletion, run it in the same database transaction as the account lifecycle change, then invoke `disposeUnusedAsset` on the returned distinct IDs **after commit**. It advances `members.draft_generation`, tombstones private drafts and removes their media references. It preserves published recipes and their media. Account deletion must coordinate member foreign keys/provider deletion in its own later lifecycle implementation; this slice does not implement account deletion.

`deleteDraft` also leaves a durable `draft_tombstones` record. Tombstones/generation checks prevent old recovery copies from recreating deleted/reset drafts. Do not purge this recovery-denial evidence when purging recipe text. A direct reload of a tombstoned draft returns 410 and an authenticated cleanup island clears this account's device recovery. In an open editor, auth/reset checks on focus, visibility and periodic revalidation stop saving and clear account recovery when denied. Logout handlers may dispatch `escalera:logout`; the editor also subscribes to Clerk session state when available and handles server 401s. Downstream account logout should invoke account-scoped cleanup before leaving the page.

Device recovery is optional, account-scoped under `escalera:recovery:<encoded-account>:<draft-id>`, and stores only validated recipe text/structured values and verified asset IDs/dimensions—never file bytes or arbitrary nested upload/provider fields. It is offered only after the server has confirmed the live draft/generation. Restore is explicit; version differences force conflict resolution. Consent withdrawal removes owned optional storage through the established consent service. Remember-language writes use `escalera:preferences:language` only with preference consent. UI switching preserves current author language, values and step.

## Media and publication contract

Reference attachment locks assets in deterministic order, verifies owner/purpose/ready state and normalizes dimensions from `media_assets`. Recipe content/version/reference changes commit together. Replacement/deletion calls `disposeUnusedAsset` after commit; it independently refuses cleanup while any reference survives. Provider failure retains durable deletion state. Private drafts remain indefinitely referenced.

`publishRecipe` returns `Draft.url` as `/recipes/<stable-id>/<slug>`, with publication/update dates. That URL serves the actual current published recipe using the same responsive preview renderer as the editor. A wrong slug redirects to the current URL. The minimum reader has text, credits, gallery, full-photo links, grouped ingredients, instructions and external video links; full reading/scaling/cooking, lifecycle transitions and first-day slug-history management remain subsequent work.

`GET /api/recipes/<id>/photos/<assetId>?variant=thumb|card|gallery` requires the **intended** active `media_references` row, a currently published recipe and a ready recipe asset before and after provider transport. It never exposes provider URLs or original/arbitrary transforms. Denial must commit before asynchronous purge. All current reader/image responses are no-store; later caching needs reviewed invalidation. Production ImageKit readiness remains hard-false, including these public derivatives, until the live privacy/quality proof in `media-proof.md` passes. Tests use only external provider transport doubles; they are not live delivery proof.

## Shared UI foundation

Official references reviewed October 13, 2026: [shadcn Astro existing-project installation](https://ui.shadcn.com/docs/installation/astro), [Astro Tailwind 4 integration](https://docs.astro.build/en/guides/styling/#tailwind), and the [shadcn registry](https://ui.shadcn.com/r/styles/new-york-v4/button.json). Component license is retained in `docs/third-party/shadcn-ui-LICENSE.md`.

`components.json` declares the new-york style, React TypeScript islands and `@/*` aliases. `src/components/ui/{button,input,textarea,label,native-select}.tsx` are actual registry-derived components, with `cn` (clsx + tailwind-merge) in `src/lib/utils.ts`. Button variants use class-variance-authority; Slot and Label use their granular Radix packages. No unused component catalog or umbrella Radix dependency was installed. NativeSelect keeps native select semantics and native disclosure UI. Default interaction targets are at least 44px. The secondary hover preserves text contrast; transitions do not interpolate foreground/background through unreadable intermediate states.

Tailwind 4.3.3 runs through its Vite plugin, whose peer range includes Vite 8. Exact runtime pins: Radix Label 2.1.17, Radix Slot 1.5.0, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0. The existing strict pnpm build allowlist and routing-security override are unchanged; no release-age exceptions were retained. Existing fonts/preloads/typography remain in the original tokens/layout. `global.css` maps semantic colors to the established cream, terracotta, green and white palette; light only.

| Surface | Shared contract |
|---|---|
| Recipe editor | Button variants, Input, Textarea, Label, NativeSelect; native checkbox/range controls preserve their semantics |
| Consent banner/settings | Same Button and Label; equal optional-action emphasis preserved |
| Photo upload/retry/remove | Same Button, Input and Label; existing direct-upload/processing state machine preserved |
| Server-rendered account forms | Native token styling and focus contract; no whole-page hydration |
| Reader/preview | Original typography/tokens; shared renderer, no client hydration needed for the public reader |

Native global selectors exclude `data-slot` primitives, so they cannot override shadcn variants, spacing or focus/disabled state. Feature CSS handles layout rather than redefining button variants. Extend these shared primitives for later islands, retaining semantic tokens instead of reintroducing per-feature button CSS. `Button asChild` is available for styled links.

Test harnesses copy actual source and use the actual Tailwind/React setup. Their generated Vite caches must remain local to each harness: symlinking `.vite`, `.astro` or `.cache` between concurrent servers causes stale dependency hashes and failed island hydration.
