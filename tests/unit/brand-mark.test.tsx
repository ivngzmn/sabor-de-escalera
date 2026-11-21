import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BrandMark } from "../../src/components/ui/brand-mark";

test("the apron mark is decorative, so the brand link keeps its text name", () => {
  const html = renderToStaticMarkup(<a href="/"><BrandMark />Sabor de Escalera</a>);
  expect(html).toContain('data-slot="brand-mark"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  expect(html).toContain("Sabor de Escalera</a>");
});

test("callers can resize the mark and swap its element", () => {
  expect(renderToStaticMarkup(<BrandMark className="size-7" />)).toContain("size-7");
  const html = renderToStaticMarkup(<BrandMark render={<svg data-testid="custom" />} />);
  expect(html).toContain('data-testid="custom"');
});
