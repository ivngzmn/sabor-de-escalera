# Recipe draft flow & editor polish — design

Date: 2026-10-19 · Branch: `feat/recipe-draft-flow` · Conventional commits.

## Why

Opening **Add Recipe** creates an empty server draft immediately (`RecipeEditor.tsx` `useEffect` → `create()`), so every visit leaves an "Untitled recipe" behind and members accumulate junk drafts. Leaving the page gives no meaningful choice — only the browser's generic "Leave site?" box while a save is pending. Deleting a draft uses an inline sentence with two identical terracotta buttons (the theme's `--destructive` is the same terracotta as `--primary`), which reads as broken and doesn't make the destructive choice obvious. The editor is also capped at `max-width: 64rem` (`editor.css`) while every other page uses the 80rem `.container`, so the page looks narrower and spacing feels off across the site.

## Goals

1. **No draft until intent.** Opening `/add-recipe` (no `?draft=`) sends nothing to the server. The draft is created the first time the member changes step (Continue, Back, or a step tab) while the form differs from `emptyRecipe()`. After that, today's autosave behaviour continues unchanged.
2. **Leave prompt for in-app navigation.** When the member clicks an in-site link (header nav, brand, account menu, footer, "Add Another Recipe", etc.) and has **unsaved work**, show a dialog (design "1A"):
   - Title: "Save your recipe before leaving?"; body names the recipe title (or "your recipe" when untitled).
   - Buttons: **Discard** (left, destructive ghost) · **Keep editing** (ghost) · **Save draft** (primary).
   - **Save draft**: create the draft if none exists, otherwise flush the pending save; navigate on success. On failure, stay, close nothing, and show the existing failure alert.
   - **Discard**: if the draft was created in *this* page session, delete it (server + device recovery copy) and navigate. If the member opened an existing draft (`?draft=` on load), discard only the unsaved changes (do not delete the draft) and navigate. If no draft exists, just navigate.
   - **Keep editing**: close dialog.
3. **When not to prompt.** No dialog if there is no unsaved work: form still equals `emptyRecipe()` with no draft, or current input equals the last server-saved input (`sameRecipe(current, saved)`). Also no dialog when the editor is `blocked`/`stopped` (deleted, signed out, published).
4. **Browser-level exits** (tab close, reload, typed URL, back/forward): keep the native `beforeunload` prompt, but fire it whenever there is unsaved work by the rule above (including pre-draft typed content), not only when a draft exists.
5. **Delete confirmation dialog** (design "2B"): AlertDialog titled "Delete draft", body "This permanently removes the draft below. This can't be undone.", a summary box with the recipe title (or "Untitled recipe"), photo count, ingredient count, and relative "last saved" time; buttons **Keep draft** (outline) and **Delete permanently** (destructive). Focus lands on Keep draft. While deleting, the destructive button shows a pending state and both are disabled. On error, keep the dialog open and show the message inside it.
6. **Destructive colour.** Introduce a distinct deep red for `--destructive` (≈ `#b42318`, with a matching light background for icon chips) in both light and dark tokens, so destructive actions never look like the primary terracotta. Check every existing `variant="destructive"` usage still reads correctly (e.g. `Alert`).
7. **Form polish with shadcn.** Add shadcn `dialog` and `alert-dialog` (and `select` if adopted) via the shadcn CLI using `components.json`. Replace `NativeSelect` with shadcn `Select`, replace remaining raw `<input>`s in the editor with shadcn `Input`/`Checkbox`, and use `Field`/`FieldLabel`/`FieldDescription`/`FieldError` consistently so every step has the same label, help-text and error spacing. Header actions (Save Draft / Delete draft) stay in the header; Delete draft uses a destructive-outline look.
8. **Width.** Remove the editor's 64rem cap so it fills the shared `.container` like other pages. Long-form text fields can keep a readable max width inside the grid, but the page frame must match the rest of the site.
9. Both languages (en/es) for all new copy, following the existing `t(en, es)` pattern.

## Non-goals

- No new recipe fields, no validation rule changes, no server API changes beyond letting create accept initial input (see decisions).
- No custom dialog for the browser back button or tab close (browsers don't allow it reliably).
- No redesign of the step tabs, preview, publish success screen, or profile drafts list.
- No cleanup migration of existing empty drafts already in the database.

## Anti-goals (would be a failure even if it "works")

- Losing typed work: any path where the member clicks Save/Continue/leave and their content silently vanishes.
- Prompting when everything is already saved.
- Discard on a re-opened, previously saved draft deleting the whole draft.
- Delete and Cancel looking alike again.

## Decisions (theirs)

- Draft creation on first Continue past step 1 with content filled in.
- Leave dialog = design 1A; delete dialog = design 2B (mockups in `.superpowers/brainstorm/`).
- No prompt when already saved and unchanged.
- Width must match other pages.
- Conventional commits on a `feat/` branch.

## Decisions (mine — flag if wrong)

- Clicking a later step tab counts the same as Continue for creating the draft.
- Back/forward use the native browser prompt, not the custom dialog.
- Discard on an existing (re-opened) draft discards only the unsaved changes.
- Language-switch links (`a[hreflang]`) are not navigation — they're already intercepted to switch language in place and must not trigger the leave dialog.
- Links opened in a new tab/window (modifier keys, middle click, `target="_blank"`), same-page hash links, and download links do not trigger the dialog.
- **Create carries the content.** `POST /api/drafts` gains an optional `input` body field, validated with the same `validateDraft` + origin + photo-ownership rules as save, so the draft is created in one request with what the member typed (no empty orphan if a follow-up save fails). This is the one small server change; the "no server API changes" non-goal is relaxed for it. The client must not overwrite local input with the server's response on create unless they match.
- **Creation trigger** is any step change (Continue, Back, or step tab) while the form is non-empty — not only leaving step 1 — so content added on later steps after skipping Details still gets a draft.
- **Header Save Draft before a draft exists**: creates the draft from the current form when non-empty; disabled when the form is empty.
- **Discard on a re-opened draft** also forgets its device recovery copy and cancels any pending autosave timer, so discarded edits don't come back as a "recovery copy".
- **Leave dialog during a 409 conflict**: the primary button becomes "Save as separate draft" (existing `copy()`), then navigates; Discard and Keep editing behave as usual.
- **Delete dialog summary** uses the current form for title / photo count / ingredient count and the server draft's `updatedAt` for "last saved".

## Notes for the builder

- Navigation interception: one capture-phase `click` listener on `document` that finds the nearest `a[href]`, filters per the rules above and same-origin URLs, and when there's unsaved work calls `preventDefault()` and opens the dialog with the target href. After the chosen action, remove the `beforeunload` guard (or mark "leaving") before `location.assign(href)` so the native prompt doesn't double up. The account menu is a separate React island (`AccountMenu`) — its links are plain anchors in a Radix dropdown; verify the listener catches them (Radix portals into `document.body`, so a document-level capture listener should).
- "Unsaved work" helper: `!stopped && (record ? !sameRecipe(current, saved) : !sameRecipe(current, emptyRecipe()))`.
- Track whether the draft was created this session (e.g. `createdHere` ref set in `create()`), to drive the Discard rule.
- Autosave effect must not run before a draft exists (today `save()` already no-ops without `record`); make sure the "unsaved" status text still makes sense pre-draft (e.g. "Not saved yet" until Continue).
- Device recovery copy (`writeRecovery`) only applies once a draft id exists — unchanged.
- Existing tests to update: `tests/e2e/editor.spec.ts` (draft created on load, inline confirm delete), `tests/e2e/shell.spec.ts`, `tests/e2e/onboarding.spec.ts` where they assume load-time creation. Add e2e coverage for: no draft on open; draft created on first Continue; leave dialog Save / Discard / Keep editing; no dialog when saved; delete dialog; axe check on both dialogs.
- Left to the builder: exact shadcn component variants, icon choice (lucide vs radix-icons already installed — prefer what's in the repo), dialog animation, and how to display relative "last saved" time.
