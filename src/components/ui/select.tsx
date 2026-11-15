"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons"
import {
  Select,
  SelectContent as SelectContentPrimitive,
  SelectGroup,
  SelectGroupLabel as SelectGroupLabelPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectItemIndicator,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue,
} from "@ui-sdk/react/select"

type Styled<T extends React.ElementType> = Omit<
  React.ComponentProps<T>,
  "className"
> & { className?: string }

type WithChildren<T extends React.ElementType> = Omit<
  Styled<T>,
  "children"
> & { children?: React.ReactNode }

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: WithChildren<typeof SelectTriggerPrimitive> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectTriggerPrimitive
      data-size={size}
      className={cn(
        "flex min-h-11 w-fit items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=sm]:text-sm *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </SelectTriggerPrimitive>
  )
}

function SelectContent({
  className,
  sideOffset = 4,
  ...props
}: Styled<typeof SelectContentPrimitive>) {
  return (
    <SelectContentPrimitive
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) scroll-my-1 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,scale] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function SelectGroupLabel({
  className,
  ...props
}: Styled<typeof SelectGroupLabelPrimitive>) {
  return (
    <SelectGroupLabelPrimitive
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: WithChildren<typeof SelectItemPrimitive>) {
  return (
    <SelectItemPrimitive
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
        <CheckIcon aria-hidden="true" className="size-4" />
      </SelectItemIndicator>
    </SelectItemPrimitive>
  )
}

function SelectSeparator({
  className,
  ...props
}: Styled<typeof SelectSeparatorPrimitive>) {
  return (
    <SelectSeparatorPrimitive
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
