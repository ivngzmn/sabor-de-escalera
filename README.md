# Sabor de Escalera

Astro server-rendered recipe community, with selective React islands reserved for interactive features. The foundation shows an empty collection until reviewed recipes and real provider integrations are ready.

Use Node 24.16+ (24.x) and pnpm 11.2.2 (pinned in `packageManager`):

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run check
pnpm run lint
pnpm test
pnpm run test:integration
pnpm run test:e2e
pnpm run build
```

E2E uses installed Google Chrome and a localhost Astro server. It runs in the foreground (`--ignore-lock`) because Astro 7 otherwise backgrounds agent-started servers. No provider credentials are needed for anonymous browser checks. Account integration tests require TEST_DATABASE_URL pointing to an isolated localhost PostgreSQL database; they create and remove a unique schema. Copy `.env.example` for local configuration; email, translation, and analytics remain disabled. Do not enable paid plans or deploy from these instructions.

See [requirements](docs/spec.md) and [provider gates](docs/operations/provider-verification.md) for account-dependent launch blockers. Contributions and favorites redirect guests to email sign-in while preserving the requested action and language. Favorites remain a later slice.


Accounts use Clerk verified sessions and a stable internal PostgreSQL ID. Configure private `DATABASE_URL` (Neon pooled URL with TLS), `CLERK_SECRET_KEY`, exact `APP_ORIGIN`, and `OWNER_BOOTSTRAP_EMAIL`, plus `PUBLIC_CLERK_PUBLISHABLE_KEY`. In the Clerk instance enable email verification codes for sign-up/sign-in and disable password, social, phone and passkey methods; set `CLERK_EMAIL_CODE_CONFIGURED=true` only after verifying those settings. Keep keyless provisioning disabled. Missing configuration disables account actions with a 503 while public browsing remains available. No provider is provisioned by these commands.

Run `pnpm run db:migrate` explicitly after configuring the intended database; migrations use pooled transactional queries, a serialization lock and checksums. Do not edit an applied migration. The owner binds once to the first verified matching identity and remains owner after an email change. Invitations are owner-created, expire after seven days, and grant admin only once to a matching verified email. Notification delivery remains disabled; share `/admin` separately. Suspension restricts contributions only. Suspended staff retain administration allowed by their role; the owner removes admin roles to revoke moderation access. Account/profile and browse access remain available. The owner alone manages roles and sees the bounded access audit. Pass a database-loaded ownership ID to `requireOwnedContribution`; never accept ownership or role claims from a client.

Live Clerk email delivery, browser session establishment, and Neon deployment connection proofs need privately configured provider credentials. The local fixtures cannot prove those provider flows. Avatar uploads depend on the later ImageKit slice; this slice supports initials and preset selection.

Authenticated contributors can create versioned drafts at `/add-recipe`, resolve conflicts, preview and publish recipes. Apply migration `0004_recipes.sql` through the migration runner before using authoring. Shared React controls use shadcn/ui and the existing light-theme tokens. See [authoring contracts](docs/operations/recipe-editor.md) for recovery, validation and media boundaries. Live photo uploads remain disabled until the documented ImageKit proofs pass; local browser fixtures do not establish production readiness.

`pnpm-lock.yaml` is the authoritative lockfile. Install with the pinned pnpm version and supported Node before running scripts. For isolated browser verification alongside an existing dev server, use `E2E_PORT=4337 pnpm run test:e2e`. The browser harness launches Astro with the same Node executable as Playwright. Do not run build/check and browser tests concurrently against the same generated Vite cache. Native build approvals are explicit in `pnpm-workspace.yaml`; review new scripts rather than allowing all builds.
