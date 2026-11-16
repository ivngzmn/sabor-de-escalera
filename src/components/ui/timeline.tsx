"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Timeline as TimelinePrimitive,
  TimelineConnector as TimelineConnectorPrimitive,
  TimelineDescription as TimelineDescriptionPrimitive,
  TimelineItem as TimelineItemPrimitive,
  TimelineMarker as TimelineMarkerPrimitive,
  TimelineTime as TimelineTimePrimitive,
  TimelineTitle as TimelineTitlePrimitive,
  createTimelineController,
  type TimelineStatus,
} from "@ui-sdk/react/timeline";

type WithClassName<T> = Omit<T, "className"> & { className?: string };

function Timeline({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelinePrimitive>>) {
  return (
    <TimelinePrimitive
      data-slot="timeline"
      className={cn(
        "flex flex-col data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:gap-6",
        className,
      )}
      {...props}
    />
  );
}

function TimelineItem({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineItemPrimitive>>) {
  return (
    <TimelineItemPrimitive
      data-slot="timeline-item"
      className={cn(
        "group/timeline-item relative grid grid-cols-[2rem_1fr] gap-x-4 pb-8 outline-none last:pb-0 data-last:pb-0 focus-visible:rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function TimelineMarker({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineMarkerPrimitive>>) {
  return (
    <TimelineMarkerPrimitive
      data-slot="timeline-marker"
      className={cn(
        "relative z-10 col-start-1 row-start-1 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-xs transition-colors",
        "data-complete:border-primary/40 data-complete:bg-secondary-soft data-complete:text-primary-ink",
        "data-current:border-primary data-current:bg-primary data-current:text-primary-foreground",
        "data-upcoming:bg-muted data-upcoming:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </TimelineMarkerPrimitive>
  );
}

function TimelineConnector({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineConnectorPrimitive>>) {
  return (
    <TimelineConnectorPrimitive
      data-slot="timeline-connector"
      className={cn(
        "col-start-1 row-start-1 row-span-5 mx-auto mt-9 w-px bg-border group-last/timeline-item:hidden group-data-last/timeline-item:hidden",
        "data-complete:bg-primary/35 data-current:bg-primary/45",
        className,
      )}
      {...props}
    />
  );
}

function TimelineTime({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineTimePrimitive>>) {
  return (
    <TimelineTimePrimitive
      data-slot="timeline-time"
      className={cn(
        "col-start-2 type-label-sm text-masa-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function TimelineTitle({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineTitlePrimitive>>) {
  return (
    <TimelineTitlePrimitive
      data-slot="timeline-title"
      className={cn(
        "col-start-2 mt-1 font-serif text-xl font-semibold leading-snug text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TimelineDescription({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof TimelineDescriptionPrimitive>>) {
  return (
    <TimelineDescriptionPrimitive
      data-slot="timeline-description"
      className={cn(
        "col-start-2 mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base",
        className,
      )}
      {...props}
    />
  );
}

export {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
  createTimelineController,
  type TimelineStatus,
};
