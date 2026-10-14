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

import { batchStatusAfterWithdrawal } from "@/lib/derive"
import { db, fromSnapshot, nowIso } from "@/lib/firebase"
import { keys } from "@/lib/query-client"
import { nextReference } from "@/lib/references"
import {
  COLLECTIONS,
  type StorageBatch,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from "@/types/models"

export function useWithdrawals(status: WithdrawalStatus | "all" = "pending", cap = 25) {
  return useQuery({
    queryKey: keys.withdrawals(status),
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      const constraints =
        status === "all"
          ? [orderBy("createdAt", "desc"), limit(cap)]
          : [where("status", "==", status), orderBy("createdAt", "desc"), limit(cap)]

      const snapshot = await getDocs(
        query(collection(db, COLLECTIONS.withdrawalRequests), ...constraints),
      )
      return snapshot.docs.map((row) => fromSnapshot<WithdrawalRequest>(row))
    },
  })
}

export function useMyWithdrawals(farmerId: string | undefined) {
  return useQuery({
    queryKey: keys.myWithdrawals,
    enabled: Boolean(farmerId),
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.withdrawalRequests),
          where("farmerId", "==", farmerId),
          orderBy("createdAt", "desc"),
          limit(25),
        ),
      )
      return snapshot.docs.map((row) => fromSnapshot<WithdrawalRequest>(row))
    },
  })
}

/**
 * A farmer asks to collect part or all of a batch.
 *
 * Postgres checked the request against the batch — including requests already
 * in flight — with a trigger. That check has to live here now, and it runs
 * inside a transaction so two requests submitted at the same moment cannot
 * between them claim more than is in the room.
 */
export function useRequestWithdrawal() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      batch: Pick<StorageBatch, "id" | "reference" | "availableKg">
      farmerId: string
      farmerName: string
      quantityKg: number
    }) => {
      if (input.quantityKg <= 0) throw new Error("Enter a quantity greater than zero.")

      // Requests already approved or waiting are claims on the same stock.
      const inFlight = await getDocs(
        query(
          collection(db, COLLECTIONS.withdrawalRequests),
          where("batchId", "==", input.batch.id),
          where("status", "in", ["pending", "approved"]),
        ),
      )

      const claimed = inFlight.docs.reduce(
        (sum, row) => sum + ((row.data().quantityKg as number) ?? 0),
        0,
      )

      const reference = await nextReference("WD")

      await runTransaction(db, async (tx) => {
        const batchRef = doc(db, COLLECTIONS.storageBatches, input.batch.id)
        const snapshot = await tx.get(batchRef)
        if (!snapshot.exists()) throw new Error("That batch no longer exists.")

        const available = (snapshot.data().availableKg as number) ?? 0
        const spare = available - claimed

        if (input.quantityKg > spare) {
          throw new Error(
            `Only ${Math.floor(spare).toLocaleString("en-NG")} kg is available after requests already in flight.`,
          )
        }

        tx.set(doc(collection(db, COLLECTIONS.withdrawalRequests)), {
          reference,
          batchId: input.batch.id,
          batchReference: input.batch.reference,
          farmerId: input.farmerId,
          farmerName: input.farmerName,
          quantityKg: input.quantityKg,
          status: "pending",
          note: null,
          decidedBy: null,
          decidedAt: null,
          collectedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["withdrawals"] })
      void client.invalidateQueries({ queryKey: keys.myBatches })
    },
  })
}

/**
 * An admin approves, declines, or marks a request collected.
 *
 * Stock only moves on collection, and it moves inside a transaction: the read
 * of availableKg and the write that reduces it cannot be separated, so two
 * collections processed at once cannot drive the room negative.
 */
export function useDecideWithdrawal() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      request: WithdrawalRequest
      status: WithdrawalStatus
      note?: string
      decidedBy: string
    }) => {
      const { request, status, note, decidedBy } = input
      const requestRef = doc(db, COLLECTIONS.withdrawalRequests, request.id)

      await runTransaction(db, async (tx) => {
        const patch: Record<string, unknown> = {
          status,
          note: note ?? request.note ?? null,
          decidedBy,
          decidedAt: request.decidedAt ?? nowIso(),
          updatedAt: nowIso(),
        }

        if (status === "collected") {
          const batchRef = doc(db, COLLECTIONS.storageBatches, request.batchId)
          const snapshot = await tx.get(batchRef)
          if (!snapshot.exists()) throw new Error("That batch no longer exists.")

          const available = (snapshot.data().availableKg as number) ?? 0
          if (available < request.quantityKg) {
            throw new Error(
              `Only ${Math.floor(available).toLocaleString("en-NG")} kg is left in ${request.batchReference}.`,
            )
          }

          tx.update(batchRef, {
            availableKg: available - request.quantityKg,
            status: batchStatusAfterWithdrawal(available, request.quantityKg),
            updatedAt: nowIso(),
          })

          patch.collectedAt = nowIso()
        }

        tx.update(requestRef, patch)
      })

      await addDoc(collection(db, COLLECTIONS.notifications), {
        recipientId: request.farmerId,
        category: "withdrawal",
        title: `Withdrawal ${request.reference} ${status}`,
        body: `${Math.round(request.quantityKg).toLocaleString("en-NG")} kg from ${request.batchReference}.`,
        link: "/farmer/dashboard",
        readAt: null,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["withdrawals"] })
      void client.invalidateQueries({ queryKey: ["batches"] })
      void client.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}
