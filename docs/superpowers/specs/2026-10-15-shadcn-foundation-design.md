# Escalera shadcn UI foundation

## Outcome

Make shadcn/ui the shared UI foundation for the existing Astro application and React islands. The user approved retaining the Escalera identity and consolidating controls, forms, panels, and feedback. Success means consistent, accessible components that make subsequent interface improvements easier.

## Visual direction

Use the Discover and Compartir Receta screenshots in `escalera-stitch-exports.zip` as references: cream page backgrounds, white and warm panel surfaces, terracotta actions, green supporting accents, serif headings, rounded controls, and generous spacing. Preserve the existing Playfair Display and Plus Jakarta Sans fonts and readable contrast. This phase establishes reusable foundations and improves existing screens; it does not implement the prototype's unfinished product features.

## Architecture and theme

Keep Astro server rendering and selective React hydration. Keep the existing Radix-based shadcn configuration, aliases, and Tailwind v4 setup. Add components through the official shadcn registry using the pinned pnpm runner; inspect generated source and preserve existing local customizations when merging upstream changes.

Use `src/styles/global.css` as the shadcn theme entry point. Complete semantic surface, foreground, muted, popover, destructive, border, focus, and radius mappings. Keep brand values in the existing token system and eliminate competing definitions where needed. Component variants own appearance; feature CSS owns page layout, media frames, and responsive composition. Remove redundant selectors only after their consumers migrate. Keep visible focus, readable inputs, and the existing 44px primary interaction targets.

## Shared components

Audit Button, Input, Textarea, Label, and NativeSelect against current official documentation without blindly overwriting them. Add Field composition, Card, Alert, Empty, Badge, Separator, Checkbox, and Skeleton as required by actual consumers. Preserve native select behavior for simple forms. Add other primitives only when an existing screen needs them.

Form layout uses FieldGroup, Field, FieldLabel, FieldDescription, and FieldError; related checkbox groups use FieldSet and FieldLegend. Field errors set `data-invalid` on the field and `aria-invalid` on its control, with stable description/error IDs. Panels and feedback use complete component compositions rather than parallel custom markup. Keep live status announcements distinct from urgent errors.

## First migration

Migrate the recipe editor's shared field renderer and repeated field groups, consent controls and panel, media feedback, and existing empty/error surfaces. Use consistent component variants and semantic tokens. Retain recipe step navigation semantics and its existing save/validation constraints; do not replace it with freely navigable Tabs merely for appearance. Preserve native server form submission and progressive enhancement on Astro account/admin pages, using server-rendered React controls where compatible without adding unnecessary hydration.

Keep draft persistence, recovery, publication, consent cleanup, upload behavior, bilingual copy, authorization, routes, and provider gates unchanged. Preserve existing field IDs, names, focus behavior, and accessible announcements. No backend changes or unrelated edits belong in this migration.

## Floating privacy preferences

On ordinary pages, show the initial privacy notice as a fixed floating panel. After accept, reject, or saving customized choices, collapse it into a persistent floating button with a cookie icon and localized accessible text (English: “Privacy preferences”; Spanish: “Preferencias de privacidad”). Reopening shows current choices in the same panel, with a close action that preserves the saved decision. Closing an undecided notice does not count as consent. Keep the dedicated privacy settings page inline and avoid a duplicate floating control there.

Use a nonmodal panel with a labelled region and explicit expanded state on the launcher. Move focus into preferences when opened by the launcher; return focus to it after closing or saving. Escape closes a reopened panel without saving. Keep the panel within mobile viewport bounds, scroll its content when necessary, respect safe-area insets, and hide floating controls when printing. Preserve optional choices defaulting off, cleanup on withdrawal, cross-tab synchronization, storage-failure behavior, and equal access to accept/reject/customize. Opening or closing never changes consent.

Keep the server-rendered notice inline until hydration enables its controls, preserving native form access without JavaScript. Measure scroll clearance for the active floating surface so footer content can scroll above it; update on expansion/resize and remove on unmount or inline settings mode.

## Skeletons and incremental UI progress

Provide reusable shadcn Skeleton compositions for recipe cards, recipe detail sections, and editor panels. Match the dimensions and responsive layout of the eventual content to limit layout shifts. Compose the official Skeleton primitive rather than hand-rolled animated divs; respect reduced-motion preferences and hide decorative shapes from assistive technology.

Use these compositions for real pending data states, replacing them with content, Empty, or Alert when loading finishes. Label the containing region as loading and apply `aria-busy` only while an operation is actually pending. An empty collection or failed request must not remain a skeleton.

For areas not implemented yet, allow the same compositions as static previews with a visible localized “Coming soon” / “Próximamente” label, no animation, and no busy/loading announcement. This communicates incremental interface progress without suggesting a request is running. Keep existing honest empty states, provider gates, and authentication requirements; do not invent recipe data or imply unavailable features work. Place previews only in existing unfinished surfaces identified during implementation, without adding new routes or replacing functional content.

## Maintainability

Document component selection, semantic token ownership, Astro versus React usage, form composition, and the CLI update workflow in a short project UI guide. Include concrete examples from migrated code so future work follows the same patterns. Do not add a public showcase route solely for this cleanup.

## Verification

Locate an installed supported Node 24 runtime and run pnpm 11.2.2 through it; the current shell resolves Node 14 and a broken pnpm launcher. Avoid changing global runtime configuration. If a supported runtime is unavailable, report the exact blocker.

Run Astro check, lint, unit tests, and build. Run relevant existing browser tests sequentially with build/check to avoid generated-cache conflicts. Visually inspect public pages and available recipe/consent fixtures at mobile and desktop widths, checking overflow, keyboard access, focus visibility, labels, validation, and disabled/pending states. Add behavior tests only for newly exposed regression risks; do not mirror generated component implementation. Local fixtures do not establish live provider readiness.

## Boundaries and risks

Global selectors can override generated components; narrow or remove them alongside each migration and verify surrounding Astro pages. Checkbox event/value APIs must preserve consent behavior. Aesthetic changes must not change editor persistence or navigation contracts. Existing unrelated media-provider edits remain outside this work. Authentication-provider UI remains provider-owned.

## Acceptance criteria

- Shared UI uses documented shadcn primitives and complete composition.
- Theme tokens consistently express the approved Escalera visual direction.
- Migrated forms and feedback retain current behavior and accessibility.
- Feature styles no longer duplicate migrated component appearance.
- Reusable skeletons cover cards, detail sections, and editor panels; pending, unfinished, empty, and error states remain distinguishable and accessible.
- Required checks pass, with any environment or provider limitations stated explicitly.
- The UI guide explains how to extend the foundation.
