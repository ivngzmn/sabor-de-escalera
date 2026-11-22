import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CopyButton } from "../../src/components/ui/copy-button";

test("before copying, the button is named by its label alone and nothing is announced", () => {
  const html = renderToStaticMarkup(
    <CopyButton getText={() => "https://example.test/r/1"} label="Copy link" copiedLabel="Copied" announcement="Link copied" />,
  );
  expect(html).not.toMatch(/ data-copied=/);
  expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>Copied<\/span>/);
  expect(html).not.toMatch(/<span[^>]*aria-hidden="true"[^>]*>Copy link<\/span>/);
  expect(html).toMatch(/<span role="status" class="sr-only"><\/span>/);
});
