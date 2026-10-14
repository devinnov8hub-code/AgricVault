/**
 * One place for every human-facing number and date.
 *
 * Money is stored in kobo (integer) and only ever becomes naira here, so
 * rounding happens once, at the edge.
 */

const NAIRA = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

const NUMBER = new Intl.NumberFormat("en-NG")

const DATE = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const DATE_SHORT = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" })

const DATE_TIME = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const TIME = new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false })

/** Kobo → "₦78,000". */
export const naira = (kobo: number) => NAIRA.format(Math.round(kobo) / 100)

/** Naira → kobo, for writing back to the database. */
export const toKobo = (naira: number) => Math.round(naira * 100)

export const number = (value: number) => NUMBER.format(value)

export const kilograms = (kg: number) => `${NUMBER.format(Math.round(kg))} kg`

export const tonnes = (kg: number) => `${(kg / 1000).toFixed(1)}t`

export const celsius = (value: number) => `${value.toFixed(1)}°C`

export const percent = (value: number) => `${Math.round(value)}%`

export const date = (value: string | Date) => DATE.format(new Date(value))

export const dateShort = (value: string | Date) => DATE_SHORT.format(new Date(value))

export const dateTime = (value: string | Date) => DATE_TIME.format(new Date(value))

export const time = (value: string | Date) => TIME.format(new Date(value))

/** "Today 15:04", "Yesterday 09:12", else "12 Sep 09:12". */
export function relativeDateTime(value: string | Date): string {
  const when = new Date(value)
  const now = new Date()
  const days = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime()) /
      86_400_000,
  )
  if (days === 0) return `Today ${TIME.format(when)}`
  if (days === 1) return `Yesterday ${TIME.format(when)}`
  return DATE_TIME.format(when)
}

/** Whole days from now until `value`; negative once it has passed. */
export function daysUntil(value: string | Date): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}
