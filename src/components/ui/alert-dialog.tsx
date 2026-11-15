import * as React from "react"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent as AlertDialogContentPrimitive,
  AlertDialogDescription as AlertDialogDescriptionPrimitive,
  AlertDialogTitle as AlertDialogTitlePrimitive,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog"
import { Button } from "@/components/ui/button"

type WithClassName<T> = Omit<T, "className"> & { className?: string }

function AlertDialogOverlay({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AlertDialogBackdrop>>) {
  return (
    <AlertDialogBackdrop
      className={cn(
        "fixed inset-0 z-50 bg-overlay transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: WithClassName<React.ComponentProps<typeof AlertDialogContentPrimitive>> & {
  size?: "default" | "sm"
}) {
  return (
    <>
      <AlertDialogOverlay />
      <AlertDialogContentPrimitive
        data-size={size}
        className={cn(
          // right-auto and bottom-auto undo the native dialog's inset: 0, which would stretch it.
          "group/alert-dialog-content fixed top-[50%] right-auto bottom-auto left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 text-foreground shadow-lg transition-[opacity,scale] duration-200 data-[size=sm]:max-w-xs data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      />
    </>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AlertDialogTitlePrimitive>>) {
  return (
    <AlertDialogTitlePrimitive
      className={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AlertDialogDescriptionPrimitive>>) {
  return (
    <AlertDialogDescriptionPrimitive
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      {...props}
    />
  )
}

type AlertDialogButtonProps = WithClassName<React.ComponentProps<typeof AlertDialogClose>> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  value = "confirm",
  ...props
}: AlertDialogButtonProps) {
  return (
    <AlertDialogClose
      value={value}
      render={<Button type="button" variant={variant} size={size} className={className} />}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogButtonProps) {
  return (
    <AlertDialogClose
      render={<Button type="button" variant={variant} size={size} className={className} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogTitle,
  AlertDialogTrigger,
}
