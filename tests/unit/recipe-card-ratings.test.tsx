import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RecipeCard from "../../src/features/recipes/RecipeCard";
import type { RecipeCard as CardData } from "../../src/features/recipes/catalog";

const card = {
  id: "d8153cda-d4d5-4135-ba59-142e6d9c5c83",
  url: "/recipes/d8153cda-d4d5-4135-ba59-142e6d9c5c83/birria",
  title: "Birria",
  origin: "mexico",
  totalMinutes: 255,
  ratingAverage: null,
  ratingCount: 0,
  favoriteCount: 0,
  favorited: false,
  translated: false,
} as unknown as CardData;

test("the card shows no rating text unless ratings are enabled", () => {
  expect(renderToStaticMarkup(<RecipeCard card={card} language="en" />)).not.toContain("Not rated yet");
  expect(renderToStaticMarkup(<RecipeCard card={card} language="en" ratingsEnabled />)).toContain("Not rated yet");
});
