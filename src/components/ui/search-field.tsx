// Search bar shell: one raised bar that rings as a whole when its input is focused.
import * as React from "react";
import { cn } from "../../lib/utils";

function SearchField({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="search-field"
      className={cn(
        "flex min-h-14 items-stretch gap-1.5 rounded-lg bg-card p-1.5 shadow-md focus-within:ring-[3px] focus-within:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export { SearchField };
