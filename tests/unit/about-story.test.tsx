import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AboutStory from "../../src/features/about/AboutStory";

test("renders English About story with ui-sdk timeline, tabs, accordion, and editors", () => {
  const html = renderToStaticMarkup(
    <AboutStory language="en" heroImageUrl="/hero.jpg" originCount={18} />,
  );
  expect(html).toContain("Home recipes, shared at one table.");
  expect(html).toContain("18 regional traditions");
  expect(html).toContain("data-slot=\"timeline\"");
  expect(html).toContain("data-slot=\"accordion\"");
  expect(html).toContain("Stephanie Perez");
  expect(html).toContain("Joanna Pineda");
  expect(html).toContain("Jose Rivera");
  expect(html).toContain("/discover");
});

test("renders Spanish About story and handles zero origin count gracefully", () => {
  const html = renderToStaticMarkup(
    <AboutStory language="es" heroImageUrl="/hero.jpg" originCount={0} />,
  );
  expect(html).toContain("Recetas de casa, compartidas en una sola mesa.");
  expect(html).toContain("Cocinas de toda Latinoamérica");
  expect(html).toContain("/discover?lang=es");
  expect(html).toContain("Nació del Recetario Escalera");
});
