import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/cn"

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface shadow-card", className)}
      {...props}
    />
  )
}

export interface CardHeaderProps {
  title: string
  description?: string
  /** Material Symbols name shown in a tinted square to the left of the title. */
  icon?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, icon, action, className }: CardHeaderProps) {
  return (
    <header
      className={cn("flex items-start justify-between gap-4 border-b border-line p-4", className)}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
            <span className="icon text-base">{icon}</span>
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="pt-1 text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-end gap-3 border-t border-line p-4", className)}
      {...props}
    />
  )
}

/* -- Stat ------------------------------------------------------------------ */

export interface StatProps {
  label: string
  value: string
  /** Material Symbols name. */
  icon?: string
  hint?: string
}

/** The one stat tile in the system. Value is mono; label and hint are not. */
export function Stat({ label, value, icon, hint }: StatProps) {
  return (
    <Card className="flex flex-1 items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="mono pt-1 text-xl font-semibold text-ink">{value}</p>
        {hint && <p className="pt-1 text-2xs text-ink-subtle">{hint}</p>}
      </div>
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-neutral-0">
          <span className="icon text-base">{icon}</span>
        </span>
      )}
    </Card>
  )
}
