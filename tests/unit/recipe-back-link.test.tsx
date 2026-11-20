import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import RecipeBackLink from "../../src/features/recipes/RecipeBackLink";
import { backTarget } from "../../src/features/recipes/back-target";

const origin = "https://sabor.example";
const current = "/recipes/d8153cda-d4d5-4135-ba59-142e6d9c5c83/birria";
const from = (referrer: string, language: "en" | "es" = "en") => backTarget({ referrer, origin, current, language });

describe("backTarget", () => {
  test("returns to the Discover page the reader came from, with its filters", () => {
    expect(from(`${origin}/discover?category=main&q=birria`)).toEqual({ href: "/discover?category=main&q=birria", place: "discover", fromSite: true });
  });

  test("names the other pages a recipe is opened from", () => {
    expect(from(`${origin}/`).place).toBe("home");
    expect(from(`${origin}/favorites`).place).toBe("favorites");
    expect(from(`${origin}/profile?tab=favorites`).place).toBe("favorites");
    expect(from(`${origin}/members/11111111-1111-4111-8111-111111111111`).place).toBe("profile");
    expect(from(`${origin}/recipes/0162992b-0fd5-46c6-a275-d3ab82082d20/arroz`).place).toBe("recipe");
    expect(from(`${origin}/about`)).toEqual({ href: "/about", place: "page", fromSite: true });
  });

  test("falls back to Discover for direct visits, other sites, and reloads", () => {
    const discover = { href: "/discover", place: "discover", fromSite: false };
    expect(from("")).toEqual(discover);
    expect(from("https://www.google.com/search?q=birria")).toEqual(discover);
    expect(from(`${origin}${current}`)).toEqual(discover);
  });

  test("keeps Spanish on the fallback", () => {
    expect(from("", "es").href).toBe("/discover?lang=es");
  });
});

test("the server renders a plain text link to Discover that works without JavaScript", () => {
  const html = renderToStaticMarkup(<RecipeBackLink language="en" />);
  expect(html).toMatch(/<a[^>]*href="\/discover"/);
  // No data-slot, so it takes the app's underlined link style instead of a button's.
  expect(html).not.toContain("data-slot");
  expect(html).toContain("Back to Discover");
  expect(html).not.toContain('role="button"');
});

test("the Spanish link reads in Spanish", () => {
  const html = renderToStaticMarkup(<RecipeBackLink language="es" />);
  expect(html).toContain('href="/discover?lang=es"');
  expect(html).toContain("Volver a Descubrir");
});
