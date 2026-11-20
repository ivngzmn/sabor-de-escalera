import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RecipeCard from "../../src/features/recipes/RecipeCard";
import type { RecipeCard as CardData } from "../../src/features/recipes/catalog";

const card = {
  id: "d8153cda-d4d5-4135-ba59-142e6d9c5c83",
  url: "/recipes/d8153cda-d4d5-4135-ba59-142e6d9c5c83/birria",
  title: "Birria",
  language: "en",
  origin: null,
  totalMinutes: 255,
  ratingAverage: null,
  ratingCount: 0,
  favoriteCount: 0,
  favorited: false,
  translated: false,
  authorName: null,
  authorId: null,
  cover: { assetId: "0f0e4d8a-8a4a-4d5f-9a54-3c1d2b9b7e11", alt: "A bowl of birria", width: 1200, height: 900 },
} as CardData;

const outsideNoscript = (html: string) => html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");

test("a deferred photo sends no image request from the server HTML, with a noscript fallback", () => {
  const html = renderToStaticMarkup(<RecipeCard card={card} language="en" photoLoading="deferred" />);
  expect(outsideNoscript(html)).not.toContain("<img");
  expect(html).toMatch(/<noscript><img[^>]*loading="lazy"/);
  expect(html).toContain('alt="A bowl of birria"');
});

test("an eager photo renders right-sized sources", () => {
  const html = renderToStaticMarkup(<RecipeCard card={card} language="en" photoLoading="eager" />);
  expect(html).toContain('loading="eager"');
  expect(html).toContain("variant=thumb 320w");
  expect(html).toContain('sizes="');
  expect(html).not.toContain("<noscript>");
});

test("the featured eager photo is fetched with high priority", () => {
  const html = renderToStaticMarkup(<RecipeCard card={card} language="en" featured />);
  expect(html).toMatch(/<img[^>]*fetchPriority="high"/);
  expect(html).toContain('loading="eager"');
});

test("other pages keep native lazy loading by default", () => {
  const html = renderToStaticMarkup(<RecipeCard card={card} language="en" />);
  expect(html).toContain('loading="lazy"');
  expect(html).not.toContain("<noscript>");
});
