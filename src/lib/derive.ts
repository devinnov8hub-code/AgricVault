import type { BatchStatus, Payment, PaymentStatus } from "@/types/models"

/**
 * The rules Postgres used to enforce, now enforced in code.
 *
 * In the SQL version `status` and `balanceKobo` were generated columns and
 * `paid <= amount` was a CHECK constraint, so they could not drift however the
 * row was written. Firestore has neither, so every write path must come through
 * here. If you add a place that writes a payment, call this — do not compute a
 * balance by hand.
 */

export interface PaymentAmounts {
  amountKobo: number
  paidKobo: number
}

export interface DerivedPayment {
  amountKobo: number
  paidKobo: number
  balanceKobo: number
  status: PaymentStatus
}

export function derivePayment({ amountKobo, paidKobo }: PaymentAmounts): DerivedPayment {
  const amount = Math.max(0, Math.round(amountKobo))
  // The old CHECK constraint, kept: a payment can never exceed what is owed.
  const paid = Math.min(amount, Math.max(0, Math.round(paidKobo)))

  return {
    amountKobo: amount,
    paidKobo: paid,
    balanceKobo: amount - paid,
    status: paid >= amount ? "paid" : paid > 0 ? "part_paid" : "due",
  }
}

/** Throws rather than silently clamping, for paths where overpaying is a bug. */
export function assertPayable(payment: Pick<Payment, "balanceKobo">, addKobo: number) {
  if (addKobo <= 0) throw new Error("Enter an amount greater than zero.")
  if (addKobo > payment.balanceKobo) {
    throw new Error("That is more than the outstanding balance on this receipt.")
  }
}

/** What a batch's status becomes once `takenKg` leaves it. */
export function batchStatusAfterWithdrawal(availableKg: number, takenKg: number): BatchStatus {
  const left = availableKg - takenKg
  if (left <= 0) return "withdrawn"
  return "partially_withdrawn"
}

/** Price a storage booking. Rate and result are both integer kobo. */
export function priceStorage(quantityKg: number, months: number, rateKoboPerTonneMonth: number) {
  const tonnes = quantityKg / 1000
  return Math.round(tonnes * months * rateKoboPerTonneMonth)
}
