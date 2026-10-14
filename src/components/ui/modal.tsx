import type { ReactNode } from "react"
import { useEffect, useRef } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/cn"

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: "sm" | "md" | "lg"
  children: ReactNode
  footer?: ReactNode
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const

/**
 * A dialog built on <dialog>, so focus trapping, Escape and the top layer come
 * from the platform rather than from us.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    dialog.addEventListener("cancel", handleCancel)
    return () => dialog.removeEventListener("cancel", handleCancel)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(event) => {
        // Clicks land on the dialog itself only when they hit the backdrop.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        "m-auto w-[calc(100%-32px)] rounded-lg border border-line bg-surface p-0 text-ink shadow-raised",
        "backdrop:bg-neutral-900/40",
        sizes[size],
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-line p-4">
        <div>
          <h2 id="modal-title" className="text-sm font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="pt-1 text-xs text-ink-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded-sm p-1 text-ink-muted transition-colors hover:bg-neutral-100 hover:text-ink"
        >
          <Icon name="close" className="text-base" />
        </button>
      </header>

      <div className="p-4">{children}</div>

      {footer && (
        <footer className="flex items-center justify-end gap-3 border-t border-line p-4">
          {footer}
        </footer>
      )}
    </dialog>
  )
}
