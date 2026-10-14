import type { ReactNode } from "react"

import circleBottom from "@/assets/brand/circleBottom.png"
import circleTop from "@/assets/brand/circleTop.png"
import { Icon } from "@/components/ui/icon"
import { Logo } from "@/components/ui/logo"

export interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-600 p-4">
      <img
        src={circleTop}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 w-96 select-none opacity-40"
      />
      <img
        src={circleBottom}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 w-80 select-none opacity-40"
      />

      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-raised">
        <div className="flex justify-center">
          <Logo className="h-9" />
        </div>

        <h1 className="pt-6 text-center text-lg font-semibold text-ink">{title}</h1>
        <p className="pt-2 text-center text-sm text-ink-muted">{subtitle}</p>

        <div className="pt-6">{children}</div>

        {footer && <div className="pt-6 text-center text-xs text-ink-muted">{footer}</div>}
      </div>
    </div>
  )
}

/** Shared error line for the auth forms. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-critical-soft px-3 py-2 text-xs text-critical"
    >
      <Icon name="error" className="shrink-0 text-base" />
      {message}
    </p>
  )
}
