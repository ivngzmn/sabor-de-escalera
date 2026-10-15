# Private media proof and release gate

Status: **BLOCKED for live uploads and delivery**. `mediaReadiness().enabled` is deliberately false in server code, regardless of environment variables. No ImageKit account, API key, paid feature, deployment or live upload was provisioned. HEIC is not advertised or accepted. Local tests verify application contracts only; provider doubles are not privacy, conversion or quality evidence.

## Implemented boundary

Verified Clerk request state supplies the actor; media routes preserve handshake responses/cookies, enforce exact-origin writes, bound JSON bodies and return `private, no-store`. PostgreSQL member locks recheck suspension/onboarding and enforce rolling 30/hour and 100/day intent limits before signing credentials, including avatars. Counters contain internal member IDs/timestamps, not raw IP addresses or filenames. Failed credential issuance still consumes an attempt. Rate ledger cleanup may delete only unreferenced abandoned intents after the longest rate window and provider reconciliation; completed intents support idempotency and are retained with assets.

V2 HS256 JWT uses the public key as `kid` and includes the full server-built payload. The browser receives a five-minute grant with a unique private owner/intent folder, no overwrite, no unique-name rewriting, no extensions, no tags, pre-transform and MIME/20,000,000-byte checks. No client-controlled provider fields are signed. Additional/unbound parameter rejection, token single use, checks before pre-transform and prevention of billable extensions require live adversarial proof. We do not fall back to V1 credentials.

Completion accepts only the internal intent ID. It locates the provider object by server-selected path, verifies private status/path/size, downloads the retained object through a server-only signed URL, bounds streaming to 2,000,000 bytes, decodes with Sharp and rejects non-WebP, corrupt, oversized, animated or metadata-bearing content. Width/height are persisted; provisional retained bounds are 2400×2400 and 2 MB. The pre-transform requests WebP at quality 85. These provisional settings need real quality measurements; a dimension/quality setting alone does not guarantee the byte bound. Rejected objects remain private and require orphan reconciliation.

Same-owner completion retries return the same existing ready asset after fresh permissions checks. Foreign, expired unfinished and altered requests fail; file identity/path uniqueness prevents a second asset from one upload. Completed hidden/deleting/deleted assets cannot be resurrected. Client provider response metadata is ignored.

Avatar replacement validates ownership/purpose, updates the member and reference in one transaction, then immediately attempts deletion of an unused old asset. Failed replacements preserve the old reference. Provider failures retain a durable `deleting` tombstone; purge request IDs are persisted, completion is polled on reconciliation, and deleted is recorded only after confirmed purge completion. A scheduler is not enabled in this slice. A crash after provider purge initiation but before persisting its ID can cause a duplicate safe purge request.

## Reference and delivery contracts for later slices

`media_references` is the source of liveness for recipe/cooking/avatar assets. Content services must lock asset rows, verify actor ownership, purpose and `ready` state, and write references in the same transaction as content. Deleting/hidden/deleted assets cannot be attached. Saved draft references never expire. Call `disposeUnusedAsset` only after committed removal/replacement; it rechecks references under an asset lock and changes state before contacting the provider. It is an internal server operation, not a public arbitrary-ID endpoint. Expired grant objects and abandoned unattached assets require a separate bounded reconciliation job. Candidate policy: after 24 hours, lock and recheck absence of references before tombstoning an unattached asset; for incomplete intents, resolve only the exact server-selected private path and queue provider deletion without downloading rejected bytes. Use bounded batches, retry transient errors and retain audit/tombstone evidence. Never expire saved draft references. This job is a later lifecycle task, not enabled here.

The owner endpoint serves private derivatives through a same-origin no-store proxy. Task 5 also provides a public recipe proxy, documented in `recipe-editor.md`, which checks the intended reference and current publication state before and after provider transport. Fixed variants: thumb 320×240, card 640×480, gallery ≤1600×1600, avatar 256×256. Original/raw variants and arbitrary transforms are rejected. Bytes are bounded and decoded again; no ImageKit delivery URLs or signed URLs leave the server. Every public-content endpoint must independently query an active public reference and current recipe/profile visibility before each delivery; caller-provided visibility is never authority. Hiding must commit an asset/content denial before asynchronous cache work. Do not expose public delivery merely because an asset exists or belongs to a published contributor.

The 2 MB response cap is below Vercel's documented 4.5 MB function payload limit, but the proxy consumes function execution, outbound transfer and ImageKit delivery quota. Sharp native Linux execution on the deployed target, cold starts, latency and free capacity remain unverified. This design makes no capacity guarantee. Public caching requires a reviewed invalidation design in later content work.

## Live evidence required before changing the gate

All are BLOCKED pending private provider configuration and owner-authorized provisioning:

- Actual 20 MB JPEG/PNG/WebP upload through browser direct transport; reject >20 MB before storage, MIME spoofing, corrupt data, SVG and animated payloads. Establish decimal MB behavior.
- Actual HEIC conversion with portrait/landscape EXIF rotations, GPS tags and difficult color/alpha/detail samples. HEIC remains denied until this passes and API/migration acceptance is deliberately changed.
- Inspect retained bytes and every delivery variant for EXIF/GPS/XMP/ICC/other metadata; verify orientation is baked into pixels before metadata stripping. Local rejection of metadata does not prove provider stripping or orientation.
- Measure stored bytes and visual quality on diverse full-size photos and responsive crops. Decide quality and bounds from evidence; pre-transform must replace large retained input, not merely create derivatives alongside it.
- Attempt unsigned original, original with query tricks, named transformations, guessed private/draft URLs, signed URL manipulation, expired signatures and added upload fields. ImageKit documents private files accessible through named transforms: account restrictions and actual bypass tests are mandatory.
- Tamper every signed field, inject extensions/AI/post-transforms, overwrite another path, replay upload JWT, increase file size and change MIME. Confirm the beta V2 API rejects all mutations on the actual account, including extra unsigned fields, without paid execution.
- Warm all original/derivative/named-transform caches, hide/replace/delete, then prove access denial and completed purge across variants. Confirm purge API path/status and whether base URL purge removes all transformed cached variants. Stored purge IDs and mocked success do not prove CDN removal.
- Verify free plan quota, private delivery configuration and Linux Sharp/Vercel runtime. No paid path-policy feature is assumed: ImageKit documents path policy as enterprise-only.

## Official references reviewed 2026-10-12

- [ImageKit V2 API](https://imagekit.io/docs/api-reference/upload-file/upload-file-v2) and [official Go SDK V2 schema](https://pkg.go.dev/github.com/imagekit-developer/imagekit-go/v2): full-payload JWT, single-use token and beta status. API reference text currently renders only Loading; schema and the official integration examples were used.
- [Official Android JWT example](https://imagekit.io/docs/integration/android): HS256, JWT header, public-key `kid`, signed upload payload. The application's signer never accepts an arbitrary client payload as that sample does.
- [Pre/post transformations](https://imagekit.io/docs/dam/pre-and-post-transformation-on-upload): pre-transform operates before library retention; post-transform is not a retained-original bound.
- [ImageKit basic security](https://imagekit.io/docs/media-delivery-basic-security): private-file named-transformation access and signed-URL enforcement configuration.
- [Path policy](https://imagekit.io/docs/dam/path-policy): MIME/size expression examples; enterprise feature not used.
- [Sharp input inspection](https://sharp.pixelplumbing.com/api-input/): metadata header inspection plus decoded pixel statistics.
- [Vercel response limit](https://vercel.com/docs/errors/function_response_payload_too_large): 4.5 MB response cap; local 2 MB cap is not an assurance of runtime cost or free quota capacity.
