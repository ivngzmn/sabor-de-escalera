import * as React from "react"
import { cn } from "@/lib/utils"
import { DotFilledIcon as CircleIcon } from "@radix-ui/react-icons"
import { Radio, RadioGroup as RadioGroupPrimitive, RadioIndicator } from "@ui-sdk/react/radio"

function RadioGroup({
  className,
  ...props
}: Omit<React.ComponentProps<typeof RadioGroupPrimitive>, "className"> & { className?: string }) {
  return <RadioGroupPrimitive className={cn("grid gap-3", className)} {...props} />
}

function RadioGroupItem({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Radio>, "className" | "children"> & { className?: string }) {
  return (
    <Radio
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    >
      <RadioIndicator className="relative flex items-center justify-center">
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioIndicator>
    </Radio>
  )
}

export { RadioGroup, RadioGroupItem }
