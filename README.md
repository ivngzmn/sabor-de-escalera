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

E2E uses installed Google Chrome and a localhost Astro server. It runs in the foreground (`--ignore-lock`) because Astro 7 otherwise backgrounds agent-started servers. No provider credentials are needed for local foundation checks. Copy `.env.example` for local configuration; email, translation, and analytics remain disabled. Do not enable paid plans or deploy from these instructions.

See [requirements](docs/spec.md) and [provider gates](docs/operations/provider-verification.md) for account-dependent launch blockers. Shell routes for contributions and favorites disclose that sign-in is pending; they do not simulate authentication or saving.
