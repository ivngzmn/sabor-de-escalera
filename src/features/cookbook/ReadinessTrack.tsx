import { CheckIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { checks, type Readiness } from "./labels";

/**
 * The four publication checks for one book recipe. `compact` shows marks only (labels stay readable to
 * screen readers); the full version names each check for the entry page.
 */
export default function ReadinessTrack({ readiness, compact = false, className }: { readiness: Readiness; compact?: boolean; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none p-0", compact ? "gap-1" : "flex-col gap-2", className)}>
      {checks.map(({ key, label }) => {
        const done = readiness[key];
        return (
          <li key={key} className={cn("flex items-center gap-2", compact && "contents")}>
            <span
              aria-hidden="true"
              title={compact ? label : undefined}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full",
                compact ? "h-2 w-6" : "size-6",
                done ? "bg-secondary text-secondary-foreground" : "border border-input bg-card",
              )}
            >
              {done && !compact && <CheckIcon className="size-4" />}
            </span>
            <span className={compact ? "sr-only" : cn("text-sm", done ? "text-foreground" : "text-muted-foreground")}>
              {label}
              <span className="sr-only">{done ? ": done" : ": needed"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
