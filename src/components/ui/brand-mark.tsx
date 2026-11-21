import * as React from "react";
import { cn } from "@/lib/utils";
import { renderElement, type RenderProp } from "@ui-sdk/react/primitive";

function BrandMark({
  className,
  render,
  ...props
}: React.ComponentProps<"svg"> & { render?: RenderProp }) {
  return renderElement(
    "svg",
    {
      "data-slot": "brand-mark",
      viewBox: "50 44 168 168",
      fill: "none",
      "aria-hidden": true,
      focusable: false,
      className: cn("size-8 shrink-0", className),
      children: (
        <g fill="var(--brand-mark-color, #1c1917)" stroke="var(--brand-mark-color, #1c1917)">
          <path d="M86 202 132 122" strokeWidth="14" strokeLinecap="round" />
          <ellipse cx="150" cy="89" rx="48" ry="37" transform="rotate(-60 150 89)" stroke="none" />
        </g>
      ),
      ...props,
    },
    render,
  );
}

export { BrandMark };
