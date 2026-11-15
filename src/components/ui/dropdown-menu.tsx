import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronRightIcon, DotFilledIcon as CircleIcon } from "@radix-ui/react-icons"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/react/menu"

type Styled<T extends React.ElementType> = Omit<
  React.ComponentProps<T>,
  "className"
> & { className?: string }

type WithChildren<T extends React.ElementType> = Omit<
  Styled<T>,
  "children"
> & { children?: React.ReactNode }

const popupClass =
  "z-50 min-w-[8rem] origin-(--transform-origin) rounded-md border bg-popover p-1 text-popover-foreground transition-[opacity,scale] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none"

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const DropdownMenu = Menu
const DropdownMenuTrigger = MenuTrigger
const DropdownMenuGroup = MenuGroup
const DropdownMenuRadioGroup = MenuRadioGroup
const DropdownMenuSub = MenuSub

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: Styled<typeof MenuContent>) {
  return (
    <MenuContent
      sideOffset={sideOffset}
      className={cn(
        popupClass,
        "max-h-(--available-height) overflow-x-hidden overflow-y-auto shadow-md",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: Styled<typeof MenuItem> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuItem
      data-inset={inset}
      data-variant={variant}
      destructive={variant === "destructive"}
      className={cn(
        itemClass,
        "px-2 py-1.5 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: WithChildren<typeof MenuCheckboxItem>) {
  return (
    <MenuCheckboxItem
      className={cn(itemClass, "py-1.5 pr-2 pl-8", className)}
      {...props}
    >
      <MenuItemIndicator className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <CheckIcon aria-hidden="true" className="size-4" />
      </MenuItemIndicator>
      {children}
    </MenuCheckboxItem>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: WithChildren<typeof MenuRadioItem>) {
  return (
    <MenuRadioItem
      className={cn(itemClass, "py-1.5 pr-2 pl-8", className)}
      {...props}
    >
      <MenuItemIndicator className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <CircleIcon aria-hidden="true" className="size-2 fill-current" />
      </MenuItemIndicator>
      {children}
    </MenuRadioItem>
  )
}

const labelClass = "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8"

// A heading for the whole menu. ui-sdk's group label throws outside a group.
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
}) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(labelClass, className)}
      {...props}
    />
  )
}

function DropdownMenuGroupLabel({
  className,
  inset,
  ...props
}: Styled<typeof MenuGroupLabel> & {
  inset?: boolean
}) {
  return (
    <MenuGroupLabel
      data-inset={inset}
      className={cn(labelClass, className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: Styled<typeof MenuSeparator>) {
  return (
    <MenuSeparator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: WithChildren<typeof MenuSubTrigger> & {
  inset?: boolean
}) {
  return (
    <MenuSubTrigger
      data-inset={inset}
      className={cn(
        itemClass,
        "px-2 py-1.5 data-[inset]:pl-8 data-open:bg-accent data-open:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon aria-hidden="true" className="ml-auto size-4 rtl:rotate-180" />
    </MenuSubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: Styled<typeof MenuSubContent>) {
  return (
    <MenuSubContent
      className={cn(popupClass, "overflow-hidden shadow-lg", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
