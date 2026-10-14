import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore"

import { derivePayment } from "@/lib/derive"
import { db, fromSnapshot, nowIso } from "@/lib/firebase"
import { keys } from "@/lib/query-client"
import { nextReference } from "@/lib/references"
import { COLLECTIONS, type Payment, type PaymentMethod, type PaymentStatus } from "@/types/models"

export const PAGE_SIZE = 10
const FETCH_CAP = 500

export type DateRange = "all" | "month" | "30"

function withinRange(iso: string | null, range: DateRange): boolean {
  if (range === "all") return true
  if (!iso) return false

  const when = new Date(iso)
  const now = new Date()

  if (range === "month") {
    return when.getMonth() === now.getMonth() && when.getFullYear() === now.getFullYear()
  }
  return now.getTime() - when.getTime() <= 30 * 86_400_000
}

async function fetchPayments(farmerId?: string): Promise<Payment[]> {
  const constraints = farmerId
    ? [where("farmerId", "==", farmerId), orderBy("createdAt", "desc"), limit(FETCH_CAP)]
    : [orderBy("createdAt", "desc"), limit(FETCH_CAP)]

  const snapshot = await getDocs(query(collection(db, COLLECTIONS.payments), ...constraints))
  return snapshot.docs.map((row) => fromSnapshot<Payment>(row))
}

export function usePayments(options: {
  search: string
  status: PaymentStatus | "all"
  range: DateRange
  page: number
}) {
  const { search, status, range, page } = options

  return useQuery({
    queryKey: keys.payments(search, status, range, page),
    queryFn: async (): Promise<{ rows: Payment[]; total: number }> => {
      const all = await fetchPayments()
      const term = search.trim().toLowerCase()

      const matched = all.filter(
        (payment) =>
          (!term ||
            payment.receiptNo.toLowerCase().includes(term) ||
            payment.farmerName.toLowerCase().includes(term) ||
            (payment.batchReference ?? "").toLowerCase().includes(term)) &&
          (status === "all" || payment.status === status) &&
          withinRange(payment.paidAt ?? payment.createdAt, range),
      )

      const start = (page - 1) * PAGE_SIZE
      return { rows: matched.slice(start, start + PAGE_SIZE), total: matched.length }
    },
  })
}

export function useMyPayments(farmerId: string | undefined, page: number) {
  return useQuery({
    queryKey: keys.myPayments(page),
    enabled: Boolean(farmerId),
    queryFn: async (): Promise<{ rows: Payment[]; total: number }> => {
      const all = await fetchPayments(farmerId)
      const start = (page - 1) * PAGE_SIZE
      return { rows: all.slice(start, start + PAGE_SIZE), total: all.length }
    },
  })
}

export interface PaymentTotals {
  collectedKobo: number
  outstandingKobo: number
  monthKobo: number
}

/** Totals across every payment, not just the page on screen. */
export function usePaymentTotals() {
  return useQuery({
    queryKey: keys.paymentStats,
    queryFn: async (): Promise<PaymentTotals> => {
      const all = await fetchPayments()

      return {
        collectedKobo: all.reduce((sum, row) => sum + row.paidKobo, 0),
        outstandingKobo: all.reduce((sum, row) => sum + row.balanceKobo, 0),
        monthKobo: all
          .filter((row) => withinRange(row.paidAt, "month"))
          .reduce((sum, row) => sum + row.paidKobo, 0),
      }
    },
  })
}

/* -- Writes ---------------------------------------------------------------- */

export interface NewPayment {
  farmerId: string
  farmerName: string
  farmerPhone: string | null
  batchId: string | null
  batchReference: string | null
  bookingId: string | null
  tonnes: number
  months: number
  rateKobo: number
  amountKobo: number
  paidKobo: number
  method: PaymentMethod | null
  transactionRef?: string | null
  recordedBy: string | null
  recordedByName: string | null
}

/** Raise a receipt. Status and balance come from derivePayment, never by hand. */
export function useCreatePayment() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: NewPayment): Promise<Payment> => {
      const receiptNo = await nextReference("RC")
      const amounts = derivePayment({ amountKobo: input.amountKobo, paidKobo: input.paidKobo })

      const payment: Omit<Payment, "id"> = {
        receiptNo,
        farmerId: input.farmerId,
        farmerName: input.farmerName,
        farmerPhone: input.farmerPhone,
        batchId: input.batchId,
        batchReference: input.batchReference,
        bookingId: input.bookingId,
        tonnes: input.tonnes,
        months: input.months,
        rateKobo: input.rateKobo,
        ...amounts,
        method: input.method,
        transactionRef: input.transactionRef ?? null,
        recordedBy: input.recordedBy,
        recordedByName: input.recordedByName,
        paidAt: amounts.paidKobo > 0 ? nowIso() : null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      const created = await addDoc(collection(db, COLLECTIONS.payments), payment)
      return { id: created.id, ...payment }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["payments"] })
      void client.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

/**
 * Record money received against an existing receipt.
 *
 * Read-then-write in a transaction, so two clerks taking cash at the same
 * counter cannot both add to a stale balance and overpay the receipt.
 */
export function useRecordPayment() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      paymentId: string
      addKobo: number
      method: PaymentMethod
      transactionRef?: string
      recordedBy: string
      recordedByName: string
    }) => {
      const ref = doc(db, COLLECTIONS.payments, input.paymentId)

      const { farmerId, receiptNo, nowPaid, total } = await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref)
        if (!snapshot.exists()) throw new Error("That receipt no longer exists.")

        const current = snapshot.data() as Payment

        if (input.addKobo <= 0) throw new Error("Enter an amount greater than zero.")
        if (input.addKobo > current.balanceKobo) {
          throw new Error("That is more than the outstanding balance on this receipt.")
        }

        const amounts = derivePayment({
          amountKobo: current.amountKobo,
          paidKobo: current.paidKobo + input.addKobo,
        })

        tx.update(ref, {
          ...amounts,
          method: input.method,
          transactionRef: input.transactionRef ?? current.transactionRef ?? null,
          recordedBy: input.recordedBy,
          recordedByName: input.recordedByName,
          paidAt: current.paidAt ?? nowIso(),
          updatedAt: nowIso(),
        })

        return {
          farmerId: current.farmerId,
          receiptNo: current.receiptNo,
          nowPaid: amounts.paidKobo,
          total: amounts.amountKobo,
        }
      })

      await addDoc(collection(db, COLLECTIONS.notifications), {
        recipientId: farmerId,
        category: "payment",
        title: "Payment recorded",
        body: `Receipt ${receiptNo} — ₦${Math.round(nowPaid / 100).toLocaleString("en-NG")} of ₦${Math.round(total / 100).toLocaleString("en-NG")} settled.`,
        link: "/farmer/payments",
        readAt: null,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["payments"] })
      void client.invalidateQueries({ queryKey: keys.dashboard })
      void client.invalidateQueries({ queryKey: ["users"] })
    },
  })
}
