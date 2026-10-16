# UI foundation

Escalera uses shadcn/ui with Radix primitives, Tailwind v4, and the existing `@/` aliases. Components live in `src/components/ui`; reusable recipe placeholder compositions live in `src/components/RecipePlaceholder.tsx`.

## Theme ownership

`src/styles/tokens.css` defines the Escalera palette and fonts. `src/styles/global.css` maps them to shadcn semantic tokens, including card, popover, muted, destructive, border, focus, and radius roles. Keep cream backgrounds, terracotta primary actions, green secondary actions, Playfair headings, and Plus Jakarta body text. The theme is light-only.

Edit primitive variants for appearance; use feature CSS and component `className` for geometry, responsive composition, and media frames. Avoid global appearance selectors that override `data-slot` controls. Keep visible focus and existing 44px primary controls. Icons use `@radix-ui/react-icons`; button icons use `data-icon="inline-start"` / `inline-end`.

## Components and forms

Use Button variants for actions, complete Card compositions for surfaces, Alert for actionable feedback, Empty for empty collections, Badge for metadata, and Separator for dividers. NativeSelect preserves native form behavior for simple options.

Compose forms with FieldGroup and Field, with FieldLabel, FieldDescription, and FieldError. Use FieldSet/FieldLegend for related controls. Set `data-invalid` on the field, `aria-invalid` on the control, and associate errors using stable IDs and `aria-describedby`. Set disabled state on the field and control together where the individual field is unavailable. Use a disabled enclosing FieldSet to disable a whole workflow.

`RecipeEditor.tsx` provides field/error association through `controlProps(field)`. `ProfileFields.tsx` and `AdminInviteFields.tsx` demonstrate server-rendered form compositions. Preserve native `name`, `defaultValue`, constraints, and submission semantics; styling does not require hydration. Provider-owned Clerk UI remains provider-owned.

## Astro and React

Astro renders page structure and noninteractive React controls on the server. Add `client:load` only to islands that need state or browser APIs: consent, recipe authoring, and photo uploads. A profile form's inputs remain server-rendered while its photo uploader is an independent interactive island.

Do not import server modules into browser components. Do not add dependencies or requests for disabled providers.

## Privacy preferences

`ConsentBanner.tsx` uses a floating nonmodal Card on ordinary pages. After a decision, a cookie-style button opens the current preferences. Save updates consent through the existing service; close/Escape discard local edits. Keyboard focus enters the fieldset on open and returns to the launcher on save/close. The dedicated privacy page stays inline.

The layout in `consent.css` respects viewport height and safe-area insets, scrolls internally, and hides floating controls when printing. Both languages preserve equal access to accept, reject, and customize. Opening/closing does not change optional permissions. Storage failure and cross-tab withdrawal remain owned by `consent/service.ts`.

The floating privacy surface measures its scroll clearance so footer links can be scrolled above it. Measurements follow panel expansion and viewport changes and are removed on unmount; the inline privacy page has no floating clearance. The server-rendered notice stays inline until hydration enables its controls, so native forms remain usable without JavaScript.

## Skeleton placeholders

Use the official Skeleton primitive through `RecipePlaceholder`:

```tsx
<RecipePlaceholder variant="editor" state="loading" language="en" />
<RecipePlaceholder variant="card" state="planned" language="es" />
```

Variants are `card`, `detail`, and `editor`. A loading placeholder exposes a localized status and `aria-busy`; its caller must replace it with content, Empty, or Alert once the operation settles. Only real pending work uses loading state. The editor uses it during initial draft creation, preserving the disabled form until the draft is ready.

Planned previews use static shapes with a visible “Coming soon” / “Próximamente” badge. They have no loading announcement, animation, or fake controls. Discover and the gated Favorites surface demonstrate incremental layout progress while preserving honest empty copy and authorization gates. The detail composition is available for future data-loading surfaces; it is not shown over already available recipe content.

All skeleton shapes are decorative and respect reduced-motion preferences. Preserve the eventual content geometry and avoid indefinite skeletons for errors or empty data.

## CLI maintenance

Use Node 24.16+ (24.x) and pnpm 11.2.2, as pinned in `package.json`:

```sh
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest search @shadcn -q field
pnpm dlx shadcn@latest docs field
pnpm dlx shadcn@latest add @shadcn/field --dry-run
pnpm dlx shadcn@latest add @shadcn/field --diff
```

Fetch the returned documentation URLs before use. Inspect existing components before adding; review generated files and imports afterward. Preserve local interaction sizes, semantic tokens, native select behavior, Radix icons, and the existing `cn` helper. Do not blindly overwrite customized primitives or introduce another utility/icon package because a registry item names one.

Run check, lint, unit tests, and build; then run browser checks sequentially with build/check to avoid shared generated-cache races. Set `TEST_DATABASE_URL` to an isolated local PostgreSQL instance for editor/integration tests. Anonymous Playwright servers explicitly disable providers, independent of developer `.env` settings. Local fixtures do not verify production providers.

## Review workflow

Use `feat/<scope>` branches, Conventional Commits, and draft PRs for reviewable milestones. The foundation starts from the existing `feat/recipe-editor` baseline; dependent privacy and recipe UI branches are stacked so reviewers see only the relevant changes. Do not merge or publish deployments as part of this workflow.
