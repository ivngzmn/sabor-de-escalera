// One joined pill of mutually exclusive options.
import { cn } from "../../lib/utils";
import { SegmentedControl as SegmentedControlPrimitive, SegmentedControlItem } from "@ui-sdk/react/segmented-control";

type SegmentedControlProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
};

function SegmentedControl({ value, onValueChange, options, "aria-label": ariaLabel }: SegmentedControlProps) {
  return (
    <SegmentedControlPrimitive
      aria-label={ariaLabel}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      className="inline-flex w-full rounded-full border border-input bg-card p-0"
    >
      {options.map((option, index) => (
        <SegmentedControlItem
          key={option.value}
          value={option.value}
          className={cn(
            "min-h-11 flex-1 cursor-pointer text-sm font-semibold text-foreground transition-[color,background-color] outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring data-checked:bg-primary data-checked:text-primary-foreground",
            index > 0 && "border-l border-input",
            index === 0 && "rounded-l-full",
            index === options.length - 1 && "rounded-r-full",
          )}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControlPrimitive>
  );
}

export { SegmentedControl };
