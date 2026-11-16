"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible as CollapsiblePrimitive,
  CollapsiblePanel as CollapsiblePanelPrimitive,
  CollapsibleTrigger as CollapsibleTriggerPrimitive,
} from "@ui-sdk/react/collapsible";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function Collapsible({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CollapsiblePrimitive>>) {
  return (
    <CollapsiblePrimitive
      data-slot="collapsible"
      className={cn(className)}
      {...props}
    />
  );
}

function CollapsibleTrigger({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CollapsibleTriggerPrimitive>>) {
  return (
    <CollapsibleTriggerPrimitive
      data-slot="collapsible-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function CollapsiblePanel({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CollapsiblePanelPrimitive>>) {
  return (
    <CollapsiblePanelPrimitive
      data-slot="collapsible-panel"
      className={cn(
        "overflow-hidden transition-[height,opacity] duration-200 ease-out h-[var(--collapsible-panel-height)] data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel };
