import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipArrow,
  TooltipContent as TooltipContentPrimitive,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip"

type Styled<T extends React.ElementType> = Omit<
  React.ComponentProps<T>,
  "className"
> & { className?: string }

function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: Styled<typeof TooltipContentPrimitive>) {
  return (
    <TooltipContentPrimitive
      sideOffset={sideOffset}
      className={cn(
        "z-50 origin-(--transform-origin) rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background shadow-md transition-[opacity,scale,translate] duration-150 ease-out data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-[side=right]:data-starting-style:-translate-x-1 data-[side=right]:data-ending-style:-translate-x-1 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0",
        className
      )}
      {...props}
    />
  )
}

export { Tooltip, TooltipArrow, TooltipContent, TooltipTrigger }
