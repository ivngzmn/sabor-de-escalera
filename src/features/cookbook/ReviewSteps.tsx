import { CheckIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import type { ReviewStep } from "./labels";

/** The numbered review order for one recipe. Only the current step explains itself, so the next action stands out. */
export default function ReviewSteps({ steps }: { steps: ReviewStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {steps.map((step, index) => {
        const current = step.status === "current";
        const done = step.status === "done";
        return (
          <li
            key={step.key}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex gap-3 rounded-xl p-2.5",
              current && "border border-masa/40 bg-masa-soft",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                done
                  ? "bg-primary text-primary-foreground"
                  : current
                    ? "bg-masa text-white"
                    : "border border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-4" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span
                className={cn(
                  "text-sm",
                  current
                    ? "font-semibold text-foreground"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {step.title}
                {done && <span className="sr-only">: done</span>}
              </span>
              {current && <p className="m-0 text-sm text-muted-foreground">{step.help}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
