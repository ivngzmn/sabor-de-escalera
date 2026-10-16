# Provider verification and launch gates

Evidence reviewed October 12, 2026. Context: local checkout, public provider documentation and official npm metadata; no authenticated provider project, account quota screen, credentials, provisioning, deployment, or paid plan was used. Documentation evidence is not account verification. Recheck quotas in the owner's account before provisioning and launch. Traffic estimates do not prove capacity.

## Free-tier evidence

| Provider | Public evidence checked | Account / launch status |
| --- | --- | --- |
| Vercel | [Hobby documentation](https://vercel.com/docs/plans/hobby): personal, non-commercial use; included 100 GB fast transfer, 10 GB origin transfer, 1M function invocations, 4 CPU hours, 360 GB memory hours. | **BLOCKED:** owner must confirm independent personal/non-commercial operation and Hobby account eligibility. Do not infer eligibility from lack of payment. No plan/overage enabled. |
| Neon | [Free-plan update](https://neon.com/blog/neon-free-plan-1-gb-per-project): 1 GB storage per project; six-hour instant restore. [Pricing](https://neon.com/pricing) must be rechecked in the provisioned account for compute/transfer allowances. | **BLOCKED:** account limits, pooled connection, durable limits, and scheduling proof require provisioning approval and credentials. Six-hour restore does not meet daily/seven-day backup requirements. |
| Clerk | [Pricing](https://clerk.com/pricing): Hobby 50,000 monthly retained users per app, three dashboard seats, no card required. | **BLOCKED:** production email-code enrollment/recovery, owner bootstrap identity and provider settings are not tested. No social login/passkeys selected. |
| ImageKit | [Plans](https://imagekit.io/plans/): free 20 GB monthly delivery, fixed 3 GB storage, 500 monthly cache purges. [Transformations](https://imagekit.io/docs/transformations) describe HEIC input conversion. | **BLOCKED:** actual HEIC orientation, 20 MB direct upload, bounded stored media, quality, private originals/drafts, metadata removal, failed replacement and moderation purge must be proved. |
| PostHog | [Analytics pricing](https://posthog.com/product-analytics/pricing): totally free 1M events/month, one-year retention. [API](https://posthog.com/docs/api) is available to all users; analytics query limits 240/minute and 1200/hour. | **BLOCKED:** free scoped aggregate query proof and 90-day raw retention. [Retention API](https://posthog.com/docs/api/events-retention) describes plan-derived read-only retention. One-year default does not satisfy 90 days. Analytics disabled. |
| Resend | [Pricing](https://resend.com/pricing): free 3,000 emails/month, 100/day. | **BLOCKED:** owner-controlled verified sending domain, credentials and live test. A Vercel subdomain does not grant DNS control. Member delivery disabled; Clerk email is independent. |

## Address, backups, media, and privacy

- Planned `sabor-de-escalera.vercel.app`: **BLOCKED, not reserved or proved available.** October 12 check context has no authenticated project/domain availability response. An HTTP/DNS absence alone would not establish availability. Next evidence: authorized owner-account availability check and successful assigned deployment URL; no deployment is authorized in this task.
- Daily encrypted private database backups with seven-day history: **BLOCKED.** No private free destination selected/proved; no restore or deletion-reconciliation test. Never put member data in public Git. Cron support alone does not prove reliable cleanup/backups.
- Media pipeline: **BLOCKED.** Do not publish cookbook/export assets without reuse evidence. Shell contains no recipe/image fixtures. Retaining every 20 MB input would allow only roughly 150 images before reaching 3 GB, excluding all other assets. Measure and bound stored originals/derivatives before deciding.
- [ImageKit basic security](https://imagekit.io/docs/media-delivery-basic-security) allows private-file access through signed URLs **or valid named transformations**. Prove there is no original/draft bypass through either path before acceptance. Optimized output metadata removal does not establish stored-original removal.
- The consent foundation stores only explicit versioned device choices; preference/recovery payloads and analytics capture remain deferred. No optional storage or external SDK requests occur before a choice. Cleanup registrations and owned storage prefixes are documented in consent-email.md. Future analytics must require both independently verified deployment readiness and current device consent; enabling a server flag alone must never capture events.
- SSR defaults to `private, no-store`; global ISR and Vercel image optimization are off. Add public caching only to reviewed public routes with invalidation. Account/draft/admin data must never enter shared caches.

## Dependency and runtime evidence

Official npm metadata checked October 12, 2026, not inferred from old examples. Installed dependencies use exact versions and a committed lockfile. [Astro's Vercel guide](https://docs.astro.build/en/guides/integrations-guide/vercel/) uses the root adapter import and `output: 'server'`.

| Package | Selected version / compatibility |
| --- | --- |
| Astro | 7.3.4; Node >=22.12, npm >=9.6.5 |
| Vercel adapter | 11.0.13; Astro ^7 |
| React integration | 5.0.3; React 17/18/19 supported |
| React / React DOM | 19.3.0; selective islands integration installed; no hydration needed by public shell |
| Clerk Astro | 4.1.12 metadata supports Astro 5/6/7; reserved for auth slice, SDK not installed/called here |
| shadcn CLI | 4.21.4 metadata checked; copy components only for a required interaction, not the Astro shell |
| TypeScript | 6.0.2; typescript-eslint 8.71.1 supports >=4.8.4 and <6.1 |
| ESLint / Astro plugin | ESLint 10.10.0 and eslint-plugin-astro 1.3.1 (declared ESLint >=8.57); newer Astro plugin 3.2.1 plus its jsx-a11y peer conflicts with ESLint 10, so no forced/legacy peer resolution |
| Fontsource | Playfair Display / Plus Jakarta Sans 5.3.0, local Latin assets including Spanish accented characters |

Use Node 24.16+ on the 24.x line and pnpm 11.2.2 (lint tooling requires current 24.x). Server secrets never use `PUBLIC_` variables or island props. `src/server/` imports are rejected in browser builds; production asset tests use harmless secret canaries. `.env.example` contains names and disabled flags only.

No quota/eligibility/permission blocker is marked passed merely because a local build succeeds. Before any launch, record owner-account plan, dates, usage caps, evidence locations, and each live proof here without recording secrets.

Local compatibility caveat: Astro 7's Vite reports deprecated esbuild/optimizeDeps options from the current React integration's `vite:react-babel` plugin. Check/build succeed; warnings are not suppressed. The shell has no hydrated React islands, so test any future interactive island's browser behavior before declaring it verified. Local axe and keyboard checks cover the foundation only; full WCAG 2.2 AA and screen-reader evidence remains a launch gate.
