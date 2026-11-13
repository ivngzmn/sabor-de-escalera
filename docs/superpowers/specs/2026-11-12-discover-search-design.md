# Discover search: one bar, one row of chips

Status: approved · 2026-11-12

## Why

The Discover search controls look clunky. A bordered input with a separate button, filled category pills, a labelled sort dropdown and a "More filters" disclosure with three labelled dropdowns make four visual styles in a small space, and half the filters hide behind a second step. Yelp's search reads cleaner: one raised bar with the button attached, then a single row of outlined pill chips where the ones that open a list carry a ▾. We borrow those patterns, not Yelp's colours, type or layout.

## Goals

- One search bar: white `card` surface, `shadow-level-2`, no border, `radius-group`, 56px tall. The Search button (terracotta `primary`, icon + label) sits inside the bar's right end at full inner height. Focus shows a 3px `ring` around the whole bar (`:focus-within`), not just the input.
- One chip row under it: `All · <categories>`, a thin divider, then `Origin ▾ · Time ▾ · Dietary ▾ · <sort> ▾`.
  - Chips are 40px-tall visual pills inside 44px hit areas, `radius-pill`, `card` fill, 1px `input` border, `body-sm` at 600.
  - Every active chip (selected category, or a filter with a value) uses one style: `primary` fill, `primary-foreground` text.
  - A ▾ chip shows the filter name when empty ("Origin") and the chosen value when set ("México", "Up to 1 h", "Vegan"). The sort chip always shows the current sort ("Newest").
- "Clear filters" link (`primary-ink`) at the row's end when any category, origin, time or diet is set.
- **"All filters" chip leads the row**, like Yelp's "All": a sliders icon (Radix `MixerHorizontalIcon`) plus "Filters" / "Filtros", and a count ("Filters · 2") when any are set. It opens a slide-out panel holding every filter in one place:
  - Modelled on Yelp's filter panel (reference screenshot, 2026-11-12): a full-height panel slides in from the left over a `color-scrim` backdrop, 400px wide on desktop and full width on phones. It is the same panel at every size, with no bottom sheet.
  - Panel surface `card` (white, as in the reference), `shadow-level-3`, 24px side padding. Header: "Filters" / "Filtros" in `title-md`, with a "Clear all" link (`primary-ink`) on the right once anything is set. There is no × button: Cancel, Escape and the backdrop close it.
  - The body scrolls; sections are separated by 1px `color-border` hairlines with 24px above and below. Each section title is `body` at 600 (Yelp's "Price", "Dietary Restrictions").
  - Sections in order, each a single choice as today's URL allows:
    1. **Total time:** a segmented control like Yelp's Price: one pill split into equal joined segments `Any | 30 min | 1 h | 2 h`, with the selected segment in `primary` fill.
    2. **Category:** wrapping FilterChip pills (`All` first).
    3. **Dietary:** wrapping pills `Any · Vegan · Vegetarian`.
    4. **Origin:** a full-width native select ("Any origin" first), since it is every Latin American country.
    5. **Sort by:** wrapping pills (`Best match` only when there is a search).
  - Footer pinned to the bottom on `card` with a top hairline: "Cancel" (link-style, `primary-ink`) on the left, "Apply filters" / "Aplicar filtros" (primary button) on the right.
  - Changes in the panel are held as a draft and apply only on "Apply filters". Cancel, Escape or the backdrop discard them. The inline chips still apply instantly.
  - Built on Radix Dialog (focus trap, Escape, focus returns to the chip), with motion only under `motion-safe`.
- Phones: the bar stays full width with an icon-only Search button below 400px; the chip row scrolls horizontally on one line, divider included.
- The "More filters" disclosure and the "Sort by" label are removed.

## Non-goals

- Map, result-card layout, result counts or a "results for …" heading (needs new data).
- A two-part "what | where" bar.
- Any change to URL parameters, the catalog API, debounced search or request cancellation.

## Anti-goals

- Losing the no-JavaScript path: the page must still filter with a plain GET.
- Yelp red or Yelp's typography; the Sabor de Escalera tokens stay.
- A custom popover that breaks keyboard or screen-reader use of the dropdowns.

## Approaches

- **A. Restyle only.** New bar and chips, "More filters" kept. Smallest change, but the two-step layout that makes it clunky stays.
- **B. Filters become chips (chosen).** All filters in one row as ▾ chips. Removes the second step and matches the Yelp pattern.
- **C. B plus a "what | where" bar** with Origin as the second segment. Crowds the search box on phones.

Ivan picked B, plus a Yelp-style "All" chip that slides out a panel with every filter.

## Decided

- ▾ chips are native `<select>`s laid invisibly over a pill that shows the label and chevron. Native lists keep keyboard, screen-reader and mobile pickers working and need no new dependency. Each select gets an `aria-label` ("Origin") and its first option reads "Any origin" / "Cualquier origen" (likewise for time and diet).
- The selects gain `name` attributes (`origin`, `time`, `diet`, `sort`) so the no-JS GET carries every filter, not just `q` and `category` as today.
- Category chips stay submit buttons, so no-JS category filtering keeps working.
- Built as small reusable pieces in `src/components/ui/`: a search-field wrapper, a `FilterChip` (button and select variants) and a shadcn-style left `Sheet` and a `SegmentedControl`, on the Radix Dialog and radio-group primitives already installed. No new dependency.
- Without JavaScript the "All filters" chip does nothing useful, so it renders only after hydration; the inline chips and selects remain the no-JS path.
- Draft-then-apply follows the reference (Cancel / Apply filters): several filters can be set without the grid reloading behind the panel after each tap.
- Copy stays bilingual, and existing strings are reused where they exist.

## Left to the builder

- Exact divider styling and gap values within the spacing scale.
- Whether the chip row wraps or scrolls between 768px and 1024px.
- Updating the design system's Field/Badge guidance with the new SearchBar and FilterChip once shipped.
