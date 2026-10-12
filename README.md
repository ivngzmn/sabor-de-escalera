# Sabor de Escalera

Astro server-rendered recipe community, with selective React islands reserved for interactive features. The foundation shows an empty collection until reviewed recipes and real provider integrations are ready.

Use Node 24.16+ (24.x) and npm 11+:

```sh
npm ci
npm run dev
npm run check
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
```

E2E uses installed Google Chrome and a localhost Astro server. It runs in the foreground (`--ignore-lock`) because Astro 7 otherwise backgrounds agent-started servers. No provider credentials are needed for anonymous browser checks. Account integration tests require TEST_DATABASE_URL pointing to an isolated localhost PostgreSQL database; they create and remove a unique schema. Copy `.env.example` for local configuration; email, translation, and analytics remain disabled. Do not enable paid plans or deploy from these instructions.

See [requirements](docs/spec.md) and [provider gates](docs/operations/provider-verification.md) for account-dependent launch blockers. Contributions and favorites redirect guests to email sign-in while preserving the requested action and language. Real saving and recipe creation arrive in later slices.


Accounts use Clerk verified sessions and a stable internal PostgreSQL ID. Configure private `DATABASE_URL` (Neon pooled URL with TLS), `CLERK_SECRET_KEY`, exact `APP_ORIGIN`, and `OWNER_BOOTSTRAP_EMAIL`, plus `PUBLIC_CLERK_PUBLISHABLE_KEY`. In the Clerk instance enable email verification codes for sign-up/sign-in and disable password, social, phone and passkey methods; set `CLERK_EMAIL_CODE_CONFIGURED=true` only after verifying those settings. Keep keyless provisioning disabled. Missing configuration disables account actions with a 503 while public browsing remains available. No provider is provisioned by these commands.

Run `npm run db:migrate` explicitly after configuring the intended database; migrations use pooled transactional queries, a serialization lock and checksums. Do not edit an applied migration. The owner binds once to the first verified matching identity and remains owner after an email change. Invitations are owner-created, expire after seven days, and grant admin only once to a matching verified email. Notification delivery remains disabled; share `/admin` separately. Suspension restricts contributions only. Suspended staff retain administration allowed by their role; the owner removes admin roles to revoke moderation access. Account/profile and browse access remain available. The owner alone manages roles and sees the bounded access audit. Pass a database-loaded ownership ID to `requireOwnedContribution`; never accept ownership or role claims from a client.

Live Clerk email delivery, browser session establishment, and Neon deployment connection proofs need privately configured provider credentials. The local fixtures cannot prove those provider flows. Avatar uploads depend on the later ImageKit slice; this slice supports initials and preset selection.
