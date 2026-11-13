import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { FilterChip, FilterSelectChip } from "../../src/components/ui/filter-chip";
import { SearchField } from "../../src/components/ui/search-field";
import { SegmentedControl } from "../../src/components/ui/segmented-control";

test("filter chip marks its pressed state and switches to the primary fill", () => {
  const on = renderToStaticMarkup(<FilterChip active>Desserts</FilterChip>);
  expect(on).toContain('aria-pressed="true"');
  expect(on).toContain("bg-primary");
  expect(renderToStaticMarkup(<FilterChip>Desserts</FilterChip>)).toContain('aria-pressed="false"');
});

test("select chip names its select, shows the value when set, and truncates long values", () => {
  const html = renderToStaticMarkup(
    <FilterSelectChip label="Origin" valueLabel="República Dominicana" active name="origin" value="do" onChange={() => {}}>
      <option value="">Any origin</option>
      <option value="do">República Dominicana</option>
    </FilterSelectChip>,
  );
  expect(html).toContain('aria-label="Origin"');
  expect(html).toContain('name="origin"');
  expect(html).toMatch(/<select[^>]*-inset-y-0\.5/);
  expect(html).toMatch(/max-w-40 truncate[^>]*>República Dominicana/);
  expect(
    renderToStaticMarkup(
      <FilterSelectChip label="Origin" value="" onChange={() => {}}>
        <option value="">Any origin</option>
      </FilterSelectChip>,
    ),
  ).toMatch(/>Origin</);
});

test("segmented control is a labelled radio group with one checked segment", () => {
  const html = renderToStaticMarkup(
    <SegmentedControl
      aria-label="Total time"
      value="60"
      onValueChange={() => {}}
      options={[
        { value: "", label: "Any" },
        { value: "30", label: "30 min" },
        { value: "60", label: "1 h" },
        { value: "120", label: "2 h" },
      ]}
    />,
  );
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="Total time"');
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
});

test("search field rings the whole bar on focus", () => {
  expect(renderToStaticMarkup(<SearchField />)).toContain("focus-within:ring-[3px]");
});
