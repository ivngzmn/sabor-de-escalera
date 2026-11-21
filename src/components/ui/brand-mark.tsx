import * as React from "react";
import { cn } from "@/lib/utils";
import { renderElement, type RenderProp } from "@ui-sdk/react/primitive";

const stairPath =
  "M0 0H90.2L47.5 100H38L70.1 24.9H53.7L21.6 100H12.2L33.6 50H20.4L0 97.7zM100 21.6V60.7H83.3zM75.7 78.6H100V100H66.5z";

function BrandMark({
  className,
  render,
  ...props
}: React.ComponentProps<"svg"> & { render?: RenderProp }) {
  return renderElement(
    "svg",
    {
      "data-slot": "brand-mark",
      viewBox: "0 0 100 100",
      "aria-hidden": true,
      focusable: false,
      className: cn("size-7 shrink-0", className),
      children: <path d={stairPath} fill="var(--brand-mark-color, #c24d2e)" />,
      ...props,
    },
    render,
  );
}

export { BrandMark };
