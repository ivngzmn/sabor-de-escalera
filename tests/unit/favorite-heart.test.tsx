import { expect, test } from "vitest";
import { renderToString } from "react-dom/server";
import { FavoriteHeart } from "../../src/components/ui/favorite-heart";

test("a heart that renders saved does not beat or burst", () => {
  const html = renderToString(<FavoriteHeart active />);
  expect(html).toContain("data-active");
  expect(html).not.toContain("data-beating");
  expect(html).not.toContain('data-part="burst"');
});

test("an unsaved heart is outlined and hidden from assistive tech", () => {
  const html = renderToString(<FavoriteHeart active={false} />);
  expect(html).not.toContain("data-active");
  expect(html).toContain('aria-hidden="true"');
});
