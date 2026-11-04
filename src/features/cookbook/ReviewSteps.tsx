import { CheckIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import type { ReviewStep } from "./labels";

/** The numbered review order for one recipe. Only the current step explains itself, so the next action stands out. */
export default function ReviewSteps({ steps }: { steps: ReviewStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {steps.map((step, index) => {
        const current = step.status === "current";
        const done = step.status === "done";
        return (
          <li key={step.key} aria-current={current ? "step" : undefined} className={cn("flex gap-3 rounded-lg p-2", current && "bg-masa-soft")}>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done ? "bg-secondary text-secondary-foreground" : current ? "bg-primary text-primary-foreground" : "border border-input bg-card text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-4" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={cn("text-sm", current ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground")}>
                {step.title}
                {done && <span className="sr-only">: done</span>}
              </span>
              {current && <p className="m-0 text-sm">{step.help}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
