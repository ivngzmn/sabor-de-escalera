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
      viewBox: "28 26 72 72",
      fill: "none",
      "aria-hidden": true,
      focusable: false,
      className: cn("size-8 shrink-0", className),
      children: (
        <>
          <path
            d="M51.5 37c0-11 25-11 25 0"
            stroke="var(--brand-mark-accent, #c84b31)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M50 36h28l16 23-5 37H39l-5-37z"
            fill="var(--brand-mark-body, #1c1917)"
          />
          <path
            d="M53.5 72h21"
            stroke="var(--brand-mark-accent, #c84b31)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      ),
      ...props,
    },
    render,
  );
}

export { BrandMark };
