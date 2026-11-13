// One joined pill of mutually exclusive options, built on a Radix radio group.
import { cn } from "../../lib/utils";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

type SegmentedControlProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
};

function SegmentedControl({ value, onValueChange, options, "aria-label": ariaLabel }: SegmentedControlProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      aria-label={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      className="inline-flex w-full rounded-full border border-input bg-card p-0"
    >
      {options.map((option, index) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          data-slot="segmented-control-item"
          className={cn(
            "min-h-11 flex-1 cursor-pointer text-sm font-semibold text-foreground transition-[color,background-color] outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
            index > 0 && "border-l border-input",
            index === 0 && "rounded-l-full",
            index === options.length - 1 && "rounded-r-full",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export { SegmentedControl };
