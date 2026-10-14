import { cn } from "@/lib/cn"

export type Tone = "neutral" | "brand" | "ok" | "warn" | "critical"

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-ink-muted",
  brand: "bg-brand-50 text-brand-600",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  critical: "bg-critical-soft text-critical",
}

export interface BadgeProps {
  children: React.ReactNode
  tone?: Tone
  /** A small dot before the label, the usual signal for a live status. */
  dot?: boolean
  className?: string
}

export function Badge({ children, tone = "neutral", dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * One place that maps a domain status to a label and a tone. Every table in
 * the app renders status through this, so "Part-paid" means the same amber
 * everywhere.
 * ------------------------------------------------------------------------- */

import type {
  AccountStatus,
  AlertSeverity,
  BatchStatus,
  BookingStatus,
  PaymentStatus,
  WithdrawalStatus,
} from "@/types/models"

type Descriptor = { label: string; tone: Tone }

const account: Record<AccountStatus, Descriptor> = {
  active: { label: "Active", tone: "ok" },
  inactive: { label: "Inactive", tone: "neutral" },
  suspended: { label: "Suspended", tone: "critical" },
}

const batch: Record<BatchStatus, Descriptor> = {
  stored: { label: "In storage", tone: "ok" },
  partially_withdrawn: { label: "Part withdrawn", tone: "brand" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  expired: { label: "Expired", tone: "critical" },
}

const withdrawal: Record<WithdrawalStatus, Descriptor> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Declined", tone: "critical" },
  collected: { label: "Collected", tone: "neutral" },
}

const payment: Record<PaymentStatus, Descriptor> = {
  paid: { label: "Paid", tone: "ok" },
  part_paid: { label: "Part-paid", tone: "warn" },
  due: { label: "Due", tone: "critical" },
}

const booking: Record<BookingStatus, Descriptor> = {
  pending: { label: "Pending", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

const severity: Record<AlertSeverity, Descriptor> = {
  warning: { label: "Warning", tone: "warn" },
  critical: { label: "Critical", tone: "critical" },
}

export function AccountBadge({ status }: { status: AccountStatus }) {
  return <Badge {...only(account[status])} dot />
}

export function BatchBadge({ status }: { status: BatchStatus }) {
  return <Badge {...only(batch[status])} dot />
}

export function WithdrawalBadge({ status }: { status: WithdrawalStatus }) {
  return <Badge {...only(withdrawal[status])} dot />
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge {...only(payment[status])} dot />
}

export function BookingBadge({ status }: { status: BookingStatus }) {
  return <Badge {...only(booking[status])} dot />
}

export function SeverityBadge({ level }: { level: AlertSeverity }) {
  return <Badge {...only(severity[level])} dot />
}

function only({ label, tone }: Descriptor) {
  return { tone, children: label }
}
