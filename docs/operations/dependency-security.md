# Dependency security

Reviewed October 12, 2026. The inherited dependency graph reported seven high
findings from two advisories. The remediation removes the unpatched development
dependency and upgrades the affected routing package within its existing major
version. Application dependencies, scripts and lint configuration are preserved.

## Routing: GHSA-9wv6-86v2-598j

[`path-to-regexp` advisory](https://github.com/advisories/GHSA-9wv6-86v2-598j)
lists versions `>=4.0.0 <6.3.0` as affected and `6.3.0` as patched. Multiple
default parameters in one path segment, such as `/:a-:b`, can generate a regular
expression with excessive backtracking. Explicit custom capture groups still
require separate scrutiny after this patch.

The inherited chain was `@astrojs/vercel@11.0.13` →
`@vercel/routing-utils@6.6.0` → `path-to-regexp@6.1.0`. Routing utilities also
install `path-to-regexp-updated`, an alias for `6.3.0`, but their wrapper compares
the two expressions and returns the old implementation. Installing the alias
alone therefore does not address the advisory.

The adapter transforms repository-controlled headers and redirect sources during
the build. Current routes do not contain the vulnerable default-parameter
pattern, and HTTP input does not supply route templates. However, the generated
Vercel function imports routing utilities and ships the affected package; its
presence cannot be dismissed as exclusively a development or build concern.

The pnpm workspace applies an exact override only to `@vercel/routing-utils`:

```yaml
overrides:
  '@vercel/routing-utils>path-to-regexp': 6.3.0
```

Both the regular dependency and the existing alias now resolve to `6.3.0`.
The production function ships `6.3.0`, and its generated routing configuration
is unchanged. The adapter remains `11.0.13`, compatible with Astro `7.3.4`.
The incompatible adapter downgrade suggested by the inherited audit was rejected.

## Development globbing: GHSA-vfj7-8cjw-p6xm

[`braces` advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects `<=3.0.3` and lists no patched release as of this review. Recursive AST
walkers can exhaust the call stack on deeply nested patterns; character and
expansion-count limits do not provide a nesting-depth guard.

The inherited development chain was `eslint-plugin-astro@1.3.1` →
`astro-eslint-parser@1.4.0` → `fast-glob@3.3.3` → `micromatch@4.0.8` →
`braces@3.0.3`. The parser sends configured TypeScript project glob strings to
`fast-glob`, which invokes brace expansion. The current lint configuration does
not enable project or project-service parsing, and HTTP or recipe data does not
supply these glob strings. This chain was not included in the Vercel function.
Removing it avoids relying on that configuration restriction as a mitigation.

The exact Astro lint plugin pin is now `2.1.1`. Its parser resolves to `2.1.0`,
which uses `tinyglobby` rather than `fast-glob`. The resulting lockfile and
installation contain no `braces`, `micromatch` or `fast-glob` dependency. The
parser's required Astro compiler resolves to `4.0.0`.

Official metadata for
[`eslint-plugin-astro@2.1.1`](https://registry.npmjs.org/eslint-plugin-astro/2.1.1)
and [`astro-eslint-parser@2.1.0`](https://registry.npmjs.org/astro-eslint-parser/2.1.0)
supports the existing ESLint `10.10.0`, TypeScript-ESLint `8.71.1` and Node
`24.19.0`. JSX accessibility linting is an optional peer; the existing recommended
Astro configuration remains in place. Browser axe and keyboard accessibility
checks remain required. No force or legacy peer-resolution bypass was used.

## Historical npm verification

The following commands and counts record the original remediation; they are not current setup instructions.

The reviewed graph has zero findings in a fresh online `npm audit --json`.
That audit result is separate from offline installation output. Clean `npm ci`,
Astro check, ESLint, unit and integration tests, browser accessibility and account
checks, and the Vercel production build were verified with Node `24.19.0` and
npm `11.12.1`. Existing tests verify trusted identities, role boundaries, client
import rejection, private `no-store` responses and public browsing without
configured providers.

The bundled Node runtime's online registry requests stalled in this environment.
Online advisory queries and audit used the established network-working Node
`24.15.0` fallback with npm `11.12.1`; clean installation and every application
verification ran with supported Node `24.19.0`. This distinction is recorded so
an offline install is never mistaken for online security verification.

The current verification covers 25 Astro files with zero diagnostics, four unit
tests, 19 integration tests and 10 browser tests. The production routing
configuration matches the reviewed account build, and the emitted function's
package metadata confirms `path-to-regexp@6.3.0`.

Use exact dependency pins and the committed lockfile for installation. Run a
fresh online audit whenever dependencies change. Reassess the scoped override
when routing utilities adopt a patched regular dependency, then verify the
resulting function artifact before removing it. Any custom route regular
expressions need their own bounded review. A clean audit covers known registry
advisories at review time; live Clerk and Neon account verification remains a
separate launch requirement described in
[provider verification](provider-verification.md).

## Current pnpm verification and maintenance

The standard toolchain is supported Node 24.16+ on 24.x and pinned pnpm 11.2.2.
Install with `pnpm install --frozen-lockfile`, run the same named scripts with
`pnpm run`, and check known advisories with `pnpm audit --json`.
`pnpm-lock.yaml` is the sole authoritative dependency lockfile. The scoped
workspace override preserves the regular and alias routing implementations at
6.3.0. All original 23 direct pins are unchanged; Vite 8.3.4 is now explicitly
declared because `astro.config.mjs` imports its public `loadEnv` API. This exact
version was already resolved by Astro 7.3.4 and satisfies Vitest 5.0.1's Vite 8 peer range.

[Official pnpm settings](https://pnpm.io/settings/dependency-resolution) document
the scoped selector. [Build settings](https://pnpm.io/settings/build) document
explicit version-specific `allowBuilds`; only `esbuild@0.28.2` is approved and
unreviewed scripts fail installation. Sharp 0.35.5 has no install lifecycle
script and uses its optional platform packages. Frozen-install verification
includes actual Sharp image encoding, decoding and resize, not just import.

Current local proof: 18 unit, 45 integration and 18 browser tests, Astro check,
ESLint, Vercel build and fresh online pnpm audit. Canary scanning, client import
rejection, real React hydration and bilingual accessibility assertions remain
active. See the Task14 report for exact commands and limitations.
