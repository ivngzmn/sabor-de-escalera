import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import FilterPanel, { sortOptions } from "../../src/features/recipes/FilterPanel";

test("best match is only offered with a search", () => {
  expect(sortOptions()).toEqual(["newest", "rated", "saved"]);
  expect(sortOptions("flan")).toEqual(["relevance", "newest", "rated", "saved"]);
});

test("the trigger counts active filters", () => {
  expect(renderToStaticMarkup(<FilterPanel params={{}} origins={[]} language="en" onApply={() => {}} />)).toContain(">Filters<");
  expect(
    renderToStaticMarkup(<FilterPanel params={{ diet: "vegan", maxMinutes: 30 }} origins={[]} language="es" onApply={() => {}} />),
  ).toContain("Filtros · 2");
});
