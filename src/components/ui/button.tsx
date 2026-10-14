import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/cn"

const button = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md",
    "font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-neutral-0 hover:bg-brand-700",
        secondary: "bg-brand-50 text-brand-600 hover:bg-brand-100",
        outline: "border border-line-strong bg-surface text-ink hover:bg-neutral-50",
        ghost: "text-ink-muted hover:bg-neutral-100 hover:text-ink",
        danger: "bg-critical text-neutral-0 hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-sm",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
)

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof button> {
  /** Material Symbols name rendered before the label. */
  icon?: string
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  block,
  icon,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(button({ variant, size, block }), className)}
      {...props}
    >
      {loading ? (
        <Icon name="progress_activity" className="animate-spin text-base" />
      ) : icon ? (
        <Icon name={icon} className="text-base" />
      ) : null}
      {children}
    </button>
  )
}
