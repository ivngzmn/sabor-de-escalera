import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AboutStory from "../../src/features/about/AboutStory";

test("renders English About story with ui-sdk timeline, tabs, accordion, and editors", () => {
  const html = renderToStaticMarkup(
    <AboutStory language="en" heroImageUrl="/hero.jpg" languageSwitchEnabled={false} />,
  );
  expect(html).toContain("Home recipes, shared at one table.");
  expect(html).not.toContain("Regional kitchens");
  expect(html).not.toContain("Edited for kitchens in English and Spanish");
  expect(html).not.toContain('value="bilingual"');
  expect(html).not.toContain("How do English and Spanish recipe translations work?");
  expect(html).toContain("02. Open web pantry");
  expect(html).toContain("data-slot=\"timeline\"");
  expect(html).toContain("data-slot=\"accordion\"");
  expect(html).toContain("Stephanie Perez");
  expect(html).toContain("Joanna Pineda");
  expect(html).toContain("Jose Rivera");
  expect(html).toContain("/discover");
});

test("renders the language timeline chapter when the switch is enabled", () => {
  const html = renderToStaticMarkup(
    <AboutStory language="es" heroImageUrl="/hero.jpg" languageSwitchEnabled />,
  );
  expect(html).toContain("Recetas de casa, compartidas en una sola mesa.");
  expect(html).toContain("Cuidado para cocinas en español e inglés");
  expect(html).not.toContain("Lee y cocina en español o en inglés");
  expect(html).not.toContain("¿Cómo funcionan las traducciones entre español e inglés?");
  expect(html).toContain("/discover?lang=es");
  expect(html).toContain("Nació del Recetario Escalera");
});
