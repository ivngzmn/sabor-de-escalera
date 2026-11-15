import { createRoot } from "react-dom/client"
import { Toast, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast as base } from "@ui-sdk/react/toast"
import { CheckCircledIcon, Cross2Icon, CrossCircledIcon, InfoCircledIcon } from "@radix-ui/react-icons"

const icons = {
  success: CheckCircledIcon,
  error: CrossCircledIcon,
  info: InfoCircledIcon,
} as const

function Toaster({ closeLabel }: { closeLabel: string }) {
  return (
    <ToastRegion side="bottom" align="center" shortcut={null}>
      {() => (
        <Toast>
          {({ type }) => {
            const Icon = icons[type as keyof typeof icons]
            return (
              <div data-slot="toast-body">
                {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
                <div data-slot="toast-text">
                  <ToastTitle />
                  <ToastDescription />
                </div>
                <ToastClose aria-label={closeLabel}>
                  <Cross2Icon aria-hidden="true" />
                </ToastClose>
              </div>
            )
          }}
        </Toast>
      )}
    </ToastRegion>
  )
}

let mounted = false

// The region mounts on the first toast, so pages that never toast carry no extra island or live region.
function mount(): boolean {
  if (mounted || typeof document === "undefined") return false
  mounted = true
  const host = document.createElement("div")
  host.id = "toaster"
  document.body.append(host)
  createRoot(host).render(<Toaster closeLabel={document.documentElement.lang === "es" ? "Cerrar" : "Close"} />)
  return true
}

type Options = Parameters<typeof base.success>[1]

function show(kind: "success" | "error" | "info", message: string, options?: Options) {
  const fresh = mount()
  // A region that just mounted needs a frame to subscribe before it can show the toast.
  if (fresh) setTimeout(() => base[kind](message, options), 50)
  else base[kind](message, options)
}

const toast = {
  success: (message: string, options?: Options) => show("success", message, options),
  error: (message: string, options?: Options) => show("error", message, options),
  info: (message: string, options?: Options) => show("info", message, options),
}

export { toast }
