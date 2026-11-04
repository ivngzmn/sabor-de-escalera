import { cn } from "@/lib/utils";
import { checks, type Readiness } from "./labels";

/**
 * The publication checks for one book recipe, as small marks. Labels stay readable to screen readers.
 */
export default function ReadinessTrack({ readiness, className }: { readiness: Readiness; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none gap-1 p-0", className)}>
      {checks.filter(({ key }) => readiness[key] !== null).map(({ key, label }) => {
        const done = readiness[key];
        return (
          <li key={key} className="contents">
            <span
              aria-hidden="true"
              title={label}
              className={cn(
                "h-2 w-6 shrink-0 rounded-full",
                done ? "bg-secondary text-secondary-foreground" : "border border-input bg-card",
              )}
            />
            <span className="sr-only">{`${label}: ${done ? "done" : "needed"}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
