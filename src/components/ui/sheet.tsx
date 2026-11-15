// Left-anchored sheet on the ui-sdk dialog; full width on phones, 400px from sm up.
import * as React from "react";
import { cn } from "../../lib/utils";
import {
  Dialog as Sheet,
  DialogBackdrop,
  DialogClose as SheetClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger as SheetTrigger,
} from "@ui-sdk/react/dialog";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function SheetContent({ children, className, ...props }: WithClassName<React.ComponentProps<typeof DialogContent>>) {
  return (
    <>
      <DialogBackdrop className="fixed inset-0 z-50 bg-overlay motion-safe:data-open:animate-overlay-in" />
      <DialogContent
        className={cn(
          // right-auto undoes the native dialog's inset: 0; max-h-none lifts its height cap.
          "fixed inset-y-0 right-auto left-0 z-50 flex h-full max-h-none w-full max-w-none flex-col bg-card text-foreground shadow-lg outline-none sm:max-w-[400px] motion-safe:data-open:animate-sheet-in",
          className,
        )}
        {...props}
      >
        {children}
      </DialogContent>
    </>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 px-6 py-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: WithClassName<React.ComponentProps<typeof DialogTitle>>) {
  return <DialogTitle className={cn("type-title-md", className)} {...props} />;
}

function SheetDescription({ className, ...props }: WithClassName<React.ComponentProps<typeof DialogDescription>>) {
  return (
    <DialogDescription
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto px-6", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex items-center justify-between gap-3 border-t border-border px-6 py-4", className)}
      {...props}
    />
  );
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
