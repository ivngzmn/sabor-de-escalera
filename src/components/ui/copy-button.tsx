import * as React from "react"
import { CopyIcon } from "@radix-ui/react-icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const ease = "duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"

function CopyButton({
  getText,
  label,
  copiedLabel,
  announcement = copiedLabel,
  onError,
  resetAfter = 2000,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  getText: () => string
  label: string
  copiedLabel: string
  announcement?: string
  onError?: () => void
  resetAfter?: number
}) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(getText())
      clearTimeout(timer.current)
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), resetAfter)
    } catch {
      onError?.()
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-copied={copied ? "" : undefined}
        className={cn(
          "group/copy transition-[color,background-color,border-color,box-shadow,scale] active:scale-[0.98] data-copied:border-primary data-copied:bg-primary data-copied:text-primary-foreground data-copied:hover:bg-primary data-copied:hover:text-primary-foreground",
          ease,
          className
        )}
        onClick={copy}
        {...props}
      >
        <span aria-hidden="true" className="grid size-4 place-items-center *:col-start-1 *:row-start-1">
          <CopyIcon
            className={cn(
              "size-4 transition-[opacity,scale,filter] group-data-copied/copy:scale-50 group-data-copied/copy:opacity-0 group-data-copied/copy:blur-[2px]",
              ease
            )}
          />
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className={cn(
              "size-4 scale-50 opacity-0 blur-[2px] transition-[opacity,scale,filter] group-data-copied/copy:scale-100 group-data-copied/copy:opacity-100 group-data-copied/copy:blur-none",
              ease
            )}
          >
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-100 duration-300 ease-out group-data-copied/copy:[stroke-dashoffset:0] motion-reduce:transition-none"
            />
          </svg>
        </span>
        <span className="grid overflow-hidden py-0.5 *:col-start-1 *:row-start-1">
          <span
            aria-hidden={copied || undefined}
            className={cn(
              "transition-[translate,opacity,filter] group-data-copied/copy:-translate-y-full group-data-copied/copy:opacity-0 group-data-copied/copy:blur-[2px]",
              ease
            )}
          >
            {label}
          </span>
          <span
            aria-hidden={!copied || undefined}
            className={cn(
              "translate-y-full opacity-0 blur-[2px] transition-[translate,opacity,filter] group-data-copied/copy:translate-y-0 group-data-copied/copy:opacity-100 group-data-copied/copy:blur-none",
              ease
            )}
          >
            {copiedLabel}
          </span>
        </span>
      </Button>
      <span role="status" className="sr-only">
        {copied ? announcement : ""}
      </span>
    </>
  )
}

export { CopyButton }
