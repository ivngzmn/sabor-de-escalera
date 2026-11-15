import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator as SeparatorPrimitive } from "@ui-sdk/react/separator";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: Omit<React.ComponentProps<typeof SeparatorPrimitive>, "className"> & { className?: string }) {
  return (
    <SeparatorPrimitive
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
