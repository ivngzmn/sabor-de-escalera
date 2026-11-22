import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../src/components/ui/tooltip";

test("an icon-only trigger is named by its label tooltip in the server HTML", () => {
  const html = renderToStaticMarkup(
    <Tooltip type="label">
      <TooltipTrigger>
        <svg aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="right">Privacy preferences</TooltipContent>
    </Tooltip>,
  );
  const tooltipId = html.match(/role="tooltip"[^>]*id="([^"]+)"|id="([^"]+)"[^>]*role="tooltip"/);
  expect(tooltipId).not.toBeNull();
  const id = tooltipId![1] ?? tooltipId![2];
  expect(html).toContain(`aria-labelledby="${id}"`);
  expect(html).toContain("Privacy preferences");
  expect(html).toMatch(/role="tooltip"[^>]*hidden|hidden[^>]*role="tooltip"/);
});
