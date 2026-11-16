"use client";

import * as React from "react";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  NumberInput as NumberInputPrimitive,
  NumberInputControl as NumberInputControlPrimitive,
  NumberInputDecrement as NumberInputDecrementPrimitive,
  NumberInputGroup as NumberInputGroupPrimitive,
  NumberInputIncrement as NumberInputIncrementPrimitive,
} from "@ui-sdk/react/number-input";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function NumberInput({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof NumberInputPrimitive>>) {
  return (
    <NumberInputPrimitive
      data-slot="number-input"
      className={cn("inline-flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function NumberInputGroup({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof NumberInputGroupPrimitive>>) {
  return (
    <NumberInputGroupPrimitive
      data-slot="number-input-group"
      className={cn(
        "inline-flex min-h-11 items-center overflow-hidden rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

function NumberInputDecrement({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof NumberInputDecrementPrimitive>>) {
  return (
    <NumberInputDecrementPrimitive
      data-slot="number-input-decrement"
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center border-r border-border text-foreground transition-colors hover:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children ?? <MinusIcon aria-hidden="true" className="size-4" />}
    </NumberInputDecrementPrimitive>
  );
}

function NumberInputControl({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof NumberInputControlPrimitive>>) {
  return (
    <NumberInputControlPrimitive
      data-slot="number-input-control"
      className={cn(
        "w-16 bg-transparent px-2 py-2 text-center text-sm font-semibold text-foreground tabular-nums outline-none",
        className,
      )}
      {...props}
    />
  );
}

function NumberInputIncrement({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof NumberInputIncrementPrimitive>>) {
  return (
    <NumberInputIncrementPrimitive
      data-slot="number-input-increment"
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center border-l border-border text-foreground transition-colors hover:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children ?? <PlusIcon aria-hidden="true" className="size-4" />}
    </NumberInputIncrementPrimitive>
  );
}

export {
  NumberInput,
  NumberInputGroup,
  NumberInputDecrement,
  NumberInputControl,
  NumberInputIncrement,
};
