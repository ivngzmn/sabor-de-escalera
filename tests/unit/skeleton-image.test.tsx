import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SkeletonImage } from "../../src/components/ui/skeleton-image";
import PhotoCarousel from "../../src/features/recipes/PhotoCarousel";
import RecipeCard from "../../src/features/recipes/RecipeCard";
import type { RecipeCard as CardData } from "../../src/features/recipes/catalog";
import type { Photo } from "../../src/features/recipes/validation";

const held = "[@media(scripting:enabled)]:opacity-0";

test("a held image renders its skeleton and a real img hidden only while scripts run", () => {
  const html = renderToStaticMarkup(<SkeletonImage hold src="/p.webp" alt="Birria" />);
  expect(html).toContain('data-slot="skeleton"');
  expect(html).toMatch(/<img[^>]*src="\/p.webp"/);
  expect(html).toContain(held);
  expect(html).not.toContain("style=");
  expect(html).not.toMatch(/<img[^>]*aria-hidden/);
});

test("an image that isn't held is never hidden, for pages that don't hydrate", () => {
  const html = renderToStaticMarkup(<SkeletonImage src="/p.webp" alt="Birria" />);
  expect(html).toContain('data-slot="skeleton"');
  expect(html).not.toContain(held);
});

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
  cover: { assetId: "1be1deff-fac5-4129-9754-5d0ffa446037", alt: "Birria in a bowl", width: 1408, height: 768 },
} as CardData;

test("Discover and Home cards hold their photo like the recipe carousel", () => {
  expect(renderToStaticMarkup(<RecipeCard card={card} language="en" holdPhoto photoLoading="eager" />)).toContain(held);
  const photo = { assetId: "1be1deff-fac5-4129-9754-5d0ffa446037", caption: "Birria", alt: "Birria in a bowl", crop: { x: 50, y: 50, zoom: 1 } } as Photo;
  const carousel = renderToStaticMarkup(<PhotoCarousel photos={[photo]} src={() => "/p.webp"} spanish={false} />);
  expect(carousel).toContain(held);
  expect(carousel).toContain('data-slot="skeleton-image"');
});

test("cards on static pages, like member profiles, show their photo as it loads", () => {
  expect(renderToStaticMarkup(<RecipeCard card={card} language="en" />)).not.toContain(held);
});
