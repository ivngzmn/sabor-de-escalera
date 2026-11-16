import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RecipeCard, { RecipeCardSkeleton } from "../../src/features/recipes/RecipeCard";
import type { RecipeCard as CardData } from "../../src/features/recipes/catalog";

const card = {
  id: "d8153cda-d4d5-4135-ba59-142e6d9c5c83",
  url: "/recipes/d8153cda-d4d5-4135-ba59-142e6d9c5c83/birria",
  title: "Birria",
  language: "en",
  origin: "mexico",
  totalMinutes: 255,
  ratingAverage: null,
  ratingCount: 0,
  favoriteCount: 0,
  favorited: false,
  translated: false,
  cover: null,
} as unknown as CardData;
const cover = { assetId: "1be1deff-fac5-4129-9754-5d0ffa446037", alt: "Birria in a bowl", width: 1408, height: 768 };

test("a card with a photo shows a skeleton behind it until the photo loads", () => {
  const html = renderToStaticMarkup(<RecipeCard card={{ ...card, cover } as CardData} language="en" />);
  expect(html).toContain('data-slot="skeleton"');
  expect(html).toContain('alt="Birria in a bowl"');
});

test("a card without a photo has no skeleton", () => {
  expect(renderToStaticMarkup(<RecipeCard card={card} language="en" />)).not.toContain('data-slot="skeleton"');
});

test("the placeholder card is hidden from assistive technology", () => {
  const html = renderToStaticMarkup(<RecipeCardSkeleton />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('data-slot="skeleton"');
});
