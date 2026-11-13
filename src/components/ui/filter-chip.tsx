// Pill-shaped filter toggles: a pressed-state button and a native-select variant.
import * as React from "react";
import { cn } from "../../lib/utils";
import { ChevronDownIcon } from "@radix-ui/react-icons";

const chipBase =
  "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-semibold text-foreground transition-[color,background-color,box-shadow] outline-none after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']";
const chipActive = "border-primary bg-primary text-primary-foreground";
const chipIdle = "hover:bg-accent";

function FilterChip({
  active = false,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type={type}
      data-slot="filter-chip"
      aria-pressed={active}
      className={cn(
        chipBase,
        "cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring",
        active ? chipActive : chipIdle,
        className,
      )}
      {...props}
    />
  );
}

function FilterSelectChip({
  label,
  valueLabel,
  active = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & {
  label: string;
  valueLabel?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="filter-select-chip"
      className={cn(chipBase, "focus-within:ring-[3px] focus-within:ring-ring", active ? chipActive : chipIdle, className)}
    >
      <span className="max-w-40 truncate">{valueLabel ?? label}</span>
      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
      <select aria-label={label} className="absolute inset-0 cursor-pointer opacity-0" {...props}>
        {children}
      </select>
    </div>
  );
}

export { FilterChip, FilterSelectChip };
