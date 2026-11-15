// Adapted from shadcn/ui new-york-v4; local theme and 44px interaction targets.
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label as LabelPrimitive } from "@ui-sdk/react/label";

function Label({
  className,
  ...props
}: Omit<React.ComponentProps<typeof LabelPrimitive>, "className"> & { className?: string }) {
  return (
    <LabelPrimitive
      className={cn(
        "flex items-center gap-2 text-base leading-normal font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
