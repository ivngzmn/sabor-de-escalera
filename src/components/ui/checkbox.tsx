"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@radix-ui/react-icons";
import { Checkbox as CheckboxPrimitive, CheckboxIndicator } from "@ui-sdk/react/checkbox";

function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<typeof CheckboxPrimitive>, "className" | "children"> & { className?: string }) {
  return (
    <CheckboxPrimitive
      className={cn(
        "peer size-6 shrink-0 rounded-[4px] border border-input bg-card shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxIndicator className="grid place-content-center text-current [&_svg]:size-4 transition-none">
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxPrimitive>
  );
}

export { Checkbox };
