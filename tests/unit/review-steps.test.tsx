import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import ReviewSteps from "../../src/features/cookbook/ReviewSteps";
import { reviewSteps } from "../../src/features/cookbook/labels";

test("only the current step explains itself, and it is marked for screen readers", () => {
  const steps = reviewSteps({ state: "draft", missing: ["text-review"], textReview: "pending", imageReview: "approved", eligible: false, sourceClearance: "not-needed" });
  const html = renderToStaticMarkup(<ReviewSteps steps={steps} />);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain("Read the preview against the book");
  expect(html).not.toContain("Add 1–6 photos");
  expect(html).toContain("Add photos and credits<span class=\"sr-only\">: done</span>");
});
