"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Progress as ProgressPrimitive,
  ProgressIndicator as ProgressIndicatorPrimitive,
  ProgressLabel as ProgressLabelPrimitive,
  ProgressTrack as ProgressTrackPrimitive,
  ProgressValue as ProgressValuePrimitive,
} from "@ui-sdk/react/progress";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function Progress({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressPrimitive>>) {
  return (
    <ProgressPrimitive
      data-slot="progress"
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function ProgressLabel({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressLabelPrimitive>>) {
  return (
    <ProgressLabelPrimitive
      data-slot="progress-label"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function ProgressValue({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressValuePrimitive>>) {
  return (
    <ProgressValuePrimitive
      data-slot="progress-value"
      className={cn("text-sm text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

function ProgressTrack({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressTrackPrimitive>>) {
  return (
    <ProgressTrackPrimitive
      data-slot="progress-track"
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressIndicatorPrimitive>>) {
  return (
    <ProgressIndicatorPrimitive
      data-slot="progress-indicator"
      className={cn(
        "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
        className,
      )}
      {...props}
    />
  );
}

export {
  Progress,
  ProgressLabel,
  ProgressValue,
  ProgressTrack,
  ProgressIndicator,
};
