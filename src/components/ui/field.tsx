import type { ComponentProps, ReactNode } from "react"
import { useId } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/cn"

const control = [
  "w-full rounded-md border border-line-strong bg-surface",
  "px-3 text-sm text-ink transition-colors",
  "placeholder:text-ink-subtle",
  "hover:border-neutral-400",
  "focus:border-brand-400 focus:outline-none",
  "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-ink-subtle",
  "aria-[invalid=true]:border-critical",
].join(" ")

/* -- Input ----------------------------------------------------------------- */

export interface InputProps extends ComponentProps<"input"> {
  /** Material Symbols name shown inside the field, on the left. */
  icon?: string
  /** A short unit or currency marker on the right, e.g. "°C", "%". */
  suffix?: string
  /** Set for identifiers, money, weights and readings. Never for prose. */
  numeric?: boolean
}

export function Input({ className, icon, suffix, numeric, ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <Icon
          name={icon}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-ink-subtle"
        />
      )}
      <input
        data-numeric={numeric || undefined}
        className={cn(
          control,
          "h-9",
          numeric && "font-mono",
          icon && "pl-9",
          suffix && "pr-12",
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">
          {suffix}
        </span>
      )}
    </div>
  )
}

/* -- Select ---------------------------------------------------------------- */

export interface SelectProps extends ComponentProps<"select"> {
  options: Array<{ value: string | number; label: string }>
}

export function Select({ className, options, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select className={cn(control, "h-9 appearance-none pr-9", className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base text-ink-subtle"
      />
    </div>
  )
}

/* -- Field wrapper --------------------------------------------------------- */

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {label}
        {required && <span className="text-critical"> *</span>}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={cn("text-xs", error ? "text-critical" : "text-ink-subtle")}
          role={error ? "alert" : undefined}
        >
          {message}
        </p>
      )}
    </div>
  )
}

/* -- Toggle ---------------------------------------------------------------- */

export interface ToggleProps {
  label: string
  icon?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ label, icon, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-brand-200 bg-brand-50 text-brand-600"
          : "border-line-strong text-ink-muted hover:bg-neutral-50",
      )}
    >
      <span className="flex items-center gap-2">
        {icon && <Icon name={icon} className="text-base" />}
        {label}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-neutral-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-neutral-0 transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  )
}
