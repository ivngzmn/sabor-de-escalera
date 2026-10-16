# Sabor de Escalera — implementation specification

Status: approved discovery decisions; ready for implementation planning.
Prepared: October 12, 2026. Public prototype deadline: November 1, 2026 (the original three-week target).

## 1. Objective and constraints
Build an independent, public recipe-sharing community. Anyone can browse, read, print, use cooking mode, and copy recipe links without registering. Free accounts unlock contributions and favorites. Desktop is first-class; phones and tablets must be equally pleasant and functional. Meet WCAG 2.2 AA through automated and manual verification, not component-library claims alone.

Launch using free service tiers only. Do not enable paid plans, overages, AI generation/translation spending, or new billable services without owner approval. Expected traffic: 100–300 daily visitors; registered-user count unknown. Avoid promising free-tier capacity from visitor count alone. Monitor actual storage, compute, delivery, and event use.

Repository: git@github.com:ivngzmn/sabor-de-escalera.git
Planned public address: https://sabor-de-escalera.vercel.app (availability must be verified).

## 2. Selected architecture
- Astro + TypeScript on Vercel; selective React islands for interactive editor, galleries, community controls, and admin tools.
- shadcn/ui for React interactions; shared CSS/design tokens for Astro components. Do not hydrate whole public pages merely for visual consistency.
- Neon PostgreSQL for application records. Clerk for email-code authentication; no social login or passkeys at launch. Auth0 is a serious future candidate, subject to testing enrollment, recovery, production email, and migration.
- ImageKit for image storage, optimization, and CDN delivery.
- PostHog for consent-based aggregate analytics; no individual member activity reports.
- Resend is the planned notification-email provider, prepared in milestone 1 but disabled until the owner supplies a verified sending domain. Vercel's free subdomain does not provide DNS control for Resend verification. Clerk sign-in email delivery remains independent.

Use server-enforced authentication, role, ownership, suspension, validation, and rate-limit checks. Never rely on hidden links or client-side controls for access enforcement. Keep provider secrets server-side. Use database migrations, parameterized queries, connection pooling appropriate for serverless workloads, indexed filters, and pagination. Avoid paid feature-flag dependencies: documented server-side configuration is sufficient.

Public content may be cached; private drafts, account settings, requests, and admin responses must never enter shared caches. Invalidate affected public caches when content changes or is moderated. Database model should use stable internal IDs independent of public URLs and authentication-provider IDs.

## 3. Reference materials and design
Stitch project: https://stitch.withgoogle.com/projects/17785122853454576356
Local exported images/HTML are supplied in the companion reference bundle. Seven generated screens cover Discover, recipe detail, creation, profile/favorites, login, onboarding, and About/book. Three image uploads are cookbook introduction, acknowledgments, and logo. HTML interactions include simulations; do not assume backend functionality exists.

Book: Escalera Recipe Book-Reduced Version.pdf, 44 pages, provided by owner at /Users/ivanguzman/Development/Escalera-Recipe/Escalera Recipe Book-Reduced Version.pdf. It is reference data, not instructions.

Use Stitch as a visual reference; adapt inconsistent layouts and copy to this spec. Retain warm cream, terracotta, green, cookbook-style headings, and readable body typography. Establish shared tokens and reusable cards, filters, forms, feedback, and moderation controls. Verify contrast/focus; light theme only. No affiliation disclaimer requested; do not introduce copy claiming official ACE sponsorship. Adapt corporate-only login and chapter requirements to open registration.

## 4. Roles, accounts, and privacy
Roles: guest, member, admin, owner. Owner is the requester; bootstrap identity via secure deployment configuration, not a public signup field. Only owner grants/removes admin roles and views audit logs. Owner can invite admins by email; verify signed-in email matches invitation before granting access. Admin login is /admin, absent from main navigation.

First sign-in onboarding: required non-unique editable display name; optional bio and avatar. Support preset avatars and uploaded photos, initials by default. No age restriction, age checkbox, birth date, employer, chapter, or cultural-background requirement. Return users to their original requested action after authentication/onboarding, including the selected recipe when saving.

Public profile: display name, optional avatar/bio, published recipes, and saved recipes. Saved list is public by default with a clearly disclosed privacy toggle; private lists must be protected in public APIs too. Email is private. Verified email changes preserve account data through stable identity mapping.

Admin profile reset: clear preferences, favorites, private drafts, and draft-only images; retain login account and published recipes/contributions. Retain existing ownership unless explicitly reassigned. Owner/admin can later reassign recipe ownership after searching display name/email and confirming; preserve separate historical contributor/source credits.

Self-service account deletion requires confirmation: remove profile, preferences, favorites, private drafts, associated unused draft/avatar assets, and authentication account/session access; preserve published contributions under Former member. Preserve separate historical cookbook/source attribution. Implement deletion as a reliable multi-provider operation with retry/reconciliation, rather than leaving an active login mapped to deleted data.

Suspended members retain login, browsing, and favorites but cannot publish/edit recipes, rate, comment/reply, upload cooking posts, report, or submit support contributions. Show neutral contribution-disabled feedback. Do not send notifications to suspended accounts. Existing content is retained unless moderated separately.

## 5. Navigation and discovery
Main navigation: Discover, Add Recipe, Favorites; profile menu contains account options. About and Privacy in accessible footer/navigation. Account areas: My Recipes, Drafts, Favorites, Settings; My Requests tucked inside Settings. Preserve discoverability of essential links during infinite scrolling.

Discover and Favorites share cards, search, filters, sorting, and automatic incremental loading. Favorites scope is saved recipes only. Guests attempting Add Recipe/Favorites are prompted to sign in and returned to the intended action.

Cards: cover, title, author display name/profile link where available, origin, total time, rating average/count or Not rated yet, favorite control. Open recipe in same tab with ordinary link/new-tab behavior. Preserve scroll position, query, filters, and sorting on Back. Badge/tag links open filtered Discover.

Search title and ingredients across available English/Spanish text; display chosen language or original fallback. Ignore accents, support partial words, rank exact-title matches first in relevance ordering. Debounce typing, cancel/discard stale requests, retain explicit Search action. URL contains query/filters/sort; no sensitive user data in URL analytics. Filters: primary category, origin, total time, optional vegan/vegetarian tags. Allergen labels/filters deferred. Optional vegan/vegetarian tags are author-provided, not certification.

Sort: Newest default, Highest Rated, Most Saved. Highest Rated requires three ratings; recipes below threshold follow newest first. Use deterministic tie-breaking and cursor pagination consistent with filters/sort. Relevance should govern search ranking unless explicitly overridden by selected sort.

Infinite scrolling: load small batches near bottom; announce additions without moving focus; provide accessible manual fallback/retry; reserve media dimensions, append rather than displace existing items, expose end of results. Avoid unlimited DOM growth without maintaining accessible navigation/back behavior.

Featured area on Discover only: admins choose and order up to six eligible recipes. One is static; 2–6 carousel with buttons/swipe, keyboard access, no automatic rotation. Zero selected falls back to newest eligible recipe. Remove unavailable selections from display immediately.

## 6. Recipe lifecycle and URLs
Draft → published immediately for authenticated, non-suspended author; no premoderation. Author can edit, unpublish, and delete own recipes. Admin can correct text, replace images, hide/restore, and reassign recipes; audit changes and reason.

Deleted recipes recoverable for 30 days, then purge content/unused images. Schedule cleanup independently of disabled translation automation. Unpublish/hidden/deleted content is inaccessible through public endpoints, search, favorites displays, profile lists, and spotlight; invalidate caches. Keep internal favorite relationship if needed for restoration, but never expose unavailable content.

Unavailable links show humorous accessible page: “Oops—this recipe has left the table.” and an Explore Recipes button, localized. Do not reveal prior contents.

Stable internal recipe ID. Title edits may change slug within first 24 hours after initial publication; old URLs redirect. After 24 hours slug remains fixed. Republishing does not restart window. Favorites link to current recipe, not snapshots. Use publication and last-updated dates on detail pages.

Allow duplicates/family variations; non-blocking similar-title notice, no uniqueness constraint on titles.

## 7. Four-step authoring and preview
Steps: Details, Photos, Ingredients, Instructions, then final reader-facing preview/checklist before publish. Responsive preview adapts to current viewport, no view switch. Freely move backward; allow incomplete drafts. Linked errors jump to step/input, focus input, announce messages; persistent hints plus optional toast, never toast-only errors.

Details: required title, one primary category, origin (supports Not sure and Fusion / Multiple regions), servings/yield with range and author-confirmed numeric scaling baseline, and timing. Fixed categories: Appetizers & Sides, Main Dishes, Desserts, Beverages. Admin-maintained origin options. Allow either total time or separate prep/cook times; optional rest/chill time; clarify derived total. Optional story, source/original-author credit, external video link, author notes, and dietary tags. External video opens original site; no uploads/embedded players.

Photos: 1–6 required for publication, selected cover, editable order, captions, alt text, replace own image. Gallery only, no per-step photos. Every recipe/cooking image needs descriptive caption (400 characters maximum), used as default alt text with refinement available. Simple cover crop/reposition; preserve full image for gallery viewer. Validate image requirements server-side.

Ingredients: up to 100, ordered structured quantity/unit/name/notes rows, optional section headings. Accept fractions, ranges, text quantities such as to taste; do not guess ambiguous paste parsing. Instructions: up to 50 ordered steps; notes/tips/substitutions within step text. Drag reorder plus Move up/down keyboard/touch alternatives.

Paste: plain text, strip copied HTML/styles in browser before sending; preserve accents, fractions, useful newlines. Optional paste-list importer splits ingredient/step lines into editable rows, preserving ambiguous text for confirmation. No rich-text editor/TinyMCE. Server independently validates/sanitizes before storage; requests can bypass browser. Never execute user HTML; context-escape plain text at output. Validate URLs separately, allowing only approved web schemes; reject script/data URLs. Do not log raw malicious submissions or draft contents.

Drafts: save immediately as Untitled recipe with title-required-before-publication hint. Autosave plus Save Draft; visible Saving/Saved/error/retry. Saved drafts indefinite until user deletion/reset/account deletion. Local recovery only with consent, account-scoped and cleared on logout; no raw image/base64 storage in device recovery. Preserve text and successful photos when uploads fail; retry per image. Version checks prevent silent multi-device overwrites; offer load latest or save current work as separate draft. Device copy must not silently resurrect deleted/reset drafts.

Publish success: View Recipe, Copy Link, Add Another Recipe.

## 8. Images and delivery
ImageKit: accept JPEG, PNG, WebP and intended HEIC support, maximum 20 MB input per photo. Verify current plan and HEIC conversion before promising support. Upload flow must accommodate Vercel payload limits via authenticated direct uploads where appropriate; verify file content/size/ownership and complete processing server-side. Show conversion/progress/retry, maintain orientation and clarity.

Deliver optimized responsive WebP versions with saved dimensions/aspect ratios to prevent layout shifts. Verify whether optimization changes only delivered versions vs stored assets; retaining 20 MB originals would quickly exhaust free storage. Define bounded stored originals/derivatives and measure quality before finalizing pipeline. Keep originals private and public images delivered only through intended optimized access. ImageKit strips metadata from optimized output by default; explicitly enforce and test orientation/GPS removal. Do not claim originals are stripped merely because derivatives are.

Replacement: after new asset and references successfully save, immediately delete old asset if unused; failed replacement leaves original. Purge delivery caches when required for replacement/moderation; no 30-day replaced-image retention. Draft images private. Gallery large viewer supports captions, keyboard navigation, close and focus restoration. Cooking posts one image; recipe gallery up to six. Cleanup orphan uploads separately; saved drafts do not expire.

## 9. Reading, printing, and cooking
Public detail includes story/credits, gallery, grouped ingredients, ordered instructions/notes, serving adjustment, share-link copy, dates, ratings, and community tabs.

Scaling uses confirmed baseline, scales numeric quantities/fractions/ranges; preserves ambiguous quantities/to taste. No scaling times or temperatures. Show/reset original amounts; printed view uses chosen servings. Imported quantities flagged for review rather than guessed.

Print Recipe: title, contributor/source/photo credits as relevant, ingredients, instructions, servings, timing; omit app navigation/community feed. Use legible print CSS and test multipage recipes.

Cooking mode on phones/tablets with readable steps and ingredient checks; no timer. Keep screen awake toggle with status; HTTPS Wake Lock where supported, release on exit, restore after returning only if still enabled; explain unavailability/system release without breaking mode. No offline recipe reading at launch.

## 10. Community
Ratings: one editable 1–5 star rating per member/recipe; authors cannot rate own recipe. Show average/count. Suspended members cannot contribute.

Comments: flat top-level comments with one level of replies. Comments/replies immutable after posting, deletable by author, hideable by admin. Parent deletion leaves Comment deleted placeholder; preserve replies. Do not accidentally expose hidden parent text in notifications/previews.

Made This: multiple posts per member/recipe, one captioned photo each. Authors can edit captions/alt text, replace own image, delete post. Authors may comment/post cooking photos on own recipe.

Community tabs: Comments selected initially, Made This, counts, lazy batches; independently load replies efficiently. Reserve image/skeleton dimensions and preserve focus. Comments, replies, cooking captions and recipe-photo captions max 400 characters, plain text, client/server validation.

## 11. Reporting, support, administration
Authenticated non-suspended accounts may report recipes/comments/replies/cooking posts. Categories: spelling/translation correction, inappropriate text, inappropriate image, other. Description plus optional suggested correction. Reports do not automatically hide content.

Admin queue: Open, In review, Resolved. Resolution: Corrected, Content hidden, No action needed; optional member-facing reply. Support form creates same protected inbox workflow with an appropriate request type. My Requests is simple date/category/status/reply list in Settings, linked from notifications.

Admins: search users, suspend/restore contribution access, reset profile, hide/restore content, correct recipes with preview, manage origins and spotlight, review cookbook imports/translations, reassign ownership. Confirm destructive resets/ownership changes and record reason. Only owner manages admins and reads audit logs. Audit actor/time/action/target/reason and necessary change details; retain one year. Minimize sensitive stored text and reconcile content/account deletion with audit retention.

Notify reporter on resolution; no automatic notification to reported author. Suppressed notifications for suspended accounts. Admin email recipients initially owner only, configurable later.

## 12. Notifications and email flags
In-app launch notifications: recipe comments, replies to member, report/support resolutions, admin abuse alerts. Avoid duplicates when recipe owner and reply recipient coincide. Separate recipe-comments/replies preference toggles enabled initially; email preferences separate. Keep UI compact, link to relevant item.

EMAIL_NOTIFICATIONS_ENABLED=false initially. Prepare Resend adapter/templates and test path in milestone 1, not member delivery before verified sending domain. When enabled, notify configured admins of new report/support items with category/time/reference/private admin link; full report text and flagged images stay in protected app. Reporter acknowledgment/resolution emails follow preferences. Never notify suspended accounts. Use durable send records, duplicate prevention, retries, failure status, and bounce/suppression handling. Email failure never loses request. No marketing broadcasts at launch.

## 13. English/Spanish and translations
English default; explicit English/Español switch. Prewritten interface dictionaries; stored recipe translations, no per-view translation API calls. Preserve recipe, servings, editor step/unsaved values; switch labels, not author text. Remember device preference only with corresponding consent. Original language always identifiable; untranslated/outdated recipes fall back to current original with notice.

Manual admin translation entry/review works at launch. AUTO_TRANSLATION_ENABLED=false; provider/credentials/budget require approval before enabling. Future daily cron processes only new/changed published recipes in bounded batches. Generated translations are awaiting review, never directly public. Support individual approval and bulk approval after review. Protect manually corrected approved text; original edits create separate proposed revision. Source version checks prevent stale job/approval writes. Mark old translations outdated and remove from reader display until revised approval. Check quantities, temperatures, and step structure; human review remains necessary. Retry/failed states, overlap protection, usage caps, documented enable/disable and rollback. Cleanup/backups schedules are separate from translation flag.

## 14. Consent and analytics
First-visit accessible banner: equal Accept optional, Reject optional, Customize. Categories: Essential always active; remember preferences, local draft recovery, usage analytics optional and off initially. Explain purposes rather than cookie-vs-storage implementation. No opt-in via scrolling/dismissal. Persistent Privacy settings; consent version/time stored minimally; honor withdrawal, stop future capture, clear optional device storage. Account autosave does not depend on optional local storage. Resets/deletion do not accidentally enable device consent.

PostHog consent-only explicit allowlist; disable autocapture, replay, person profiles, identification with Clerk IDs/emails, cross-site/ad tracking. No recipe text, search text, comments, drafts, support details in event data. Aggregate reports only. Plan counts for page views, publication, favorites, language, cooking mode; query aggregate results server-side with cached admin summaries. Operational Neon totals are distinct from consented analytics; show coverage/limitations. Raw event retention target 90 days: verify provider free-plan controls/API deletion or aggregation strategy before claiming enforced retention. No individual timelines, including anonymous persistent profiling beyond requirements.

## 15. Abuse limits and operational reliability
Starting per-account limits, configurable server-side:
- Publish: 5/hour and 20/day.
- Comments/replies combined: 10/minute and 100/day.
- Made This: 10/hour and 30/day.
- Reports/support: 5/hour and 20/day.
- Image uploads: 30/hour and 100/day.
- Draft autosave: no more than one write per five seconds per draft; debounce unchanged writes.
Broader burst IP protections must avoid punishing normal shared networks; do not use serverless memory as the sole durable limiter. Verify free implementation; use transactional database counters or verified free provider. Gate storage credentials before upload. Friendly retry duration feedback preserves work. Owner dashboard abuse alerts, email later. Security/operational counters are distinct from optional product analytics; document minimal IP retention.

Daily database backups, seven-day history, before imports/major releases. Choose and verify free private backup storage; encrypted access, no public Git artifacts containing member data. Restore test before launch; backup recovery must not silently resurrect deleted accounts/content, document deletion reconciliation. Neon short restore window is not the backup strategy. Rate/usage monitoring and admin audit retention cleanup required.

## 16. Cookbook import
Import all recipes, not just a starter subset. Preserve contributor, original author, source/video URLs, ingredient sections, fractions/ranges, servings and total times. No automated guessing of questionable values; correct obvious spelling/formatting without changing meaning. Distinguish historical credit from current owning account; initial ownership unassigned, admin connects later.

Admin import queue includes text review, image/source/license review, translation state, missing data, publication eligibility. No CSV export at launch. Import all into database; publish each only after required information/image review is complete, unresolved recipes stay unpublished. All-recipe publication remains launch goal; identify blockers early rather than substitute invented facts.

Prioritize suitable owner-permitted images or individually verified licensed Pexels/Unsplash photos; attribution alone is not permission. Record photographer/source photo URL/license/retrieval date/cropping. Display Photo by … on … credit even where optional. Label replacement stock photos Illustrative photo. Book inclusion does not establish public-web image/text reuse rights; track unresolved permission/source issues. No publication permission checkbox requested.

AI images approved as fallback with AI-generated illustrative image label, provider usage/cost subject to approval. Test small sample; admin review dish/ingredients/serving authenticity, realism/artifacts, crop/card/full quality, caption/alt before using. Do not imply image depicts author’s exact preparation. License/rights cannot be guaranteed by generation alone.

## 17. Milestones (proposed delivery sequence)
M1 — by October 18: repository setup, shared tokens/components, Astro/Vercel deployment, migration skeleton/Neon, Clerk email login/onboarding/owner permissions, consent foundation, ImageKit HEIC/private-upload spike, Resend adapter disabled, verify planned URL. End-to-end account and upload proof.
M2 — by October 25: all-book import/review, discovery/profile/favorites, four-step autosave editor/conflicts/preview, recipe lifecycle/URLs/scaling/print/cooking, manual translations, basic community/report/admin vertical slices.
M3 — by November 1: community replies/notifications/preferences, moderation/ownership/audit/feature carousel, PostHog aggregates, usage/rate limits/cleanup/backups, accessibility/mobile/tablet/performance verification, recovery tests and public launch documentation. Treat milestones as implementation planning targets, not proof work is already complete.

## 18. Acceptance and verification
- Guest browse/share/print/cook work; contribution/favorite/report require auth. Intended action survives login/onboarding.
- All protected operations tested for guest, other member, suspended member, admin, owner. Admin audit/role management owner-only.
- Draft autosave/retry/local-consent/logout/reset/conflict tested; no public draft access.
- Publish missing-field checklist/focus, 1–6 photos/captions, pasted malicious text and invalid links tested at server boundary.
- HEIC orientation/conversion, 20 MB direct upload, compression quality/crop, original privacy, metadata output removal, failed replacement preservation and deletion/cache tested.
- URL first-day redirects/freeze, unpublished/hidden/deleted caches/search/favorites/profile removal, restoration and 30-day cleanup tested.
- Rating ownership/min-count, comment immutability/one-level replies/deletion placeholders, lazy feeds, notifications dedupe/preferences/suspension tested.
- Translation stale-source protection, manual edits/bulk approval/fallback, no AI requests with flag off tested.
- No optional analytics/storage pre-consent or after withdrawal; no sensitive text/IDs/events; protected aggregate API; verify retention enforcement.
- Desktop/phone/tablet real flows; keyboard/screen reader/zoom/reduced-motion/contrast/form errors/carousel/dialog/infinite scroll. WCAG 2.2 AA evidence recorded, not blanket automatic certification.
- Targets: representative mobile public recipe LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; document device/network/sample and measured results. Consent-gated third-party code, image sizing/caching, database cold starts assessed.
- Free quotas checked, paid features off; private backup restore and deletion reconciliation verified; no secrets in client/repo/logs.

## 19. Deferred and candidates
Passkeys (Auth0 candidate), social login, automated translations until approved, Resend member delivery until domain verified, events/potlucks (Luma candidate), shopping lists, annual cookbook submissions, allergen labeling, collections, account/recipe exports, import CSV export, dark mode, offline reading, per-step images, video upload/embedding, session replay, marketing.

## 20. Remaining engineering decisions / blockers
Verify Vercel Hobby eligibility and slug availability; pin current compatible Astro/React/shadcn/Clerk dependencies. Verify current free quotas at provisioning (prior research changes over time). Prove ImageKit HEIC/private transformed delivery/cached moderation and bounded originals; PostHog 90-day retention and free aggregate API access; private free backup storage; durable rate limiting and scheduled deletion/retention jobs. Select translation provider only after approval. Owner bootstrap email and verified email sending domain supplied privately at deployment. No provider account provisioning, paid charges, repository push, or deployment has been performed by this specification task.
