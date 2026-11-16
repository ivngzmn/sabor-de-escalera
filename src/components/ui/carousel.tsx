"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  Carousel as CarouselPrimitive,
  CarouselContent as CarouselContentPrimitive,
  CarouselIndicator as CarouselIndicatorPrimitive,
  CarouselIndicatorGroup as CarouselIndicatorGroupPrimitive,
  CarouselItem as CarouselItemPrimitive,
  CarouselNext as CarouselNextPrimitive,
  CarouselPrevious as CarouselPreviousPrimitive,
  CarouselViewport as CarouselViewportPrimitive,
  createCarouselController,
} from "@ui-sdk/react/carousel";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function Carousel({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselPrimitive>>) {
  return (
    <CarouselPrimitive
      data-slot="carousel"
      className={cn("relative flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function CarouselViewport({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselViewportPrimitive>>) {
  return (
    <CarouselViewportPrimitive
      data-slot="carousel-viewport"
      className={cn(
        "overflow-hidden focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring [scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

function CarouselContent({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselContentPrimitive>>) {
  return (
    <CarouselContentPrimitive
      data-slot="carousel-content"
      className={cn("flex gap-6 py-1", className)}
      {...props}
    />
  );
}

function CarouselItem({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselItemPrimitive>>) {
  return (
    <CarouselItemPrimitive
      data-slot="carousel-item"
      className={cn("min-w-0 shrink-0", className)}
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselPreviousPrimitive>>) {
  return (
    <CarouselPreviousPrimitive
      data-slot="carousel-previous"
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-[background-color,color,opacity] hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children ?? <ChevronLeftIcon aria-hidden="true" className="size-4" />}
    </CarouselPreviousPrimitive>
  );
}

function CarouselNext({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselNextPrimitive>>) {
  return (
    <CarouselNextPrimitive
      data-slot="carousel-next"
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-[background-color,color,opacity] hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children ?? <ChevronRightIcon aria-hidden="true" className="size-4" />}
    </CarouselNextPrimitive>
  );
}

function CarouselIndicatorGroup({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselIndicatorGroupPrimitive>>) {
  return (
    <CarouselIndicatorGroupPrimitive
      data-slot="carousel-indicator-group"
      className={cn("flex items-center justify-center gap-2", className)}
      {...props}
    />
  );
}

function CarouselIndicator({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CarouselIndicatorPrimitive>>) {
  return (
    <CarouselIndicatorPrimitive
      data-slot="carousel-indicator"
      className={cn(
        "h-2 w-2 cursor-pointer rounded-full bg-border transition-[width,background-color] duration-200 hover:bg-outline data-selected:w-6 data-selected:bg-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
  createCarouselController,
};
