"use client";

import * as React from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  Accordion as AccordionPrimitive,
  AccordionHeader as AccordionHeaderPrimitive,
  AccordionItem as AccordionItemPrimitive,
  AccordionPanel as AccordionPanelPrimitive,
  AccordionTrigger as AccordionTriggerPrimitive,
} from "@ui-sdk/react/accordion";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function Accordion({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AccordionPrimitive>>) {
  return (
    <AccordionPrimitive
      data-slot="accordion"
      className={cn("flex flex-col divide-y divide-border", className)}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AccordionItemPrimitive>>) {
  return (
    <AccordionItemPrimitive
      data-slot="accordion-item"
      className={cn("py-1", className)}
      {...props}
    />
  );
}

function AccordionHeader({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AccordionHeaderPrimitive>>) {
  return (
    <AccordionHeaderPrimitive
      data-slot="accordion-header"
      className={cn("m-0 flex", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: Omit<WithClassName<React.ComponentProps<typeof AccordionTriggerPrimitive>>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <AccordionTriggerPrimitive
      data-slot="accordion-trigger"
      className={cn(
        "group flex min-h-11 flex-1 cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180"
      />
    </AccordionTriggerPrimitive>
  );
}

function AccordionPanel({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof AccordionPanelPrimitive>>) {
  return (
    <AccordionPanelPrimitive
      data-slot="accordion-panel"
      className={cn(
        "overflow-hidden text-sm text-muted-foreground transition-[height,opacity] duration-200 ease-out h-[var(--accordion-panel-height)] data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
};
