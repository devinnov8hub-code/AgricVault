import { doc, runTransaction } from "firebase/firestore"

import { db } from "@/lib/firebase"
import { COLLECTIONS } from "@/types/models"

/**
 * Human-readable references: ST-0412, BK-0021, WD-0007, RC-0101.
 *
 * Postgres had sequences. Firestore does not, so each prefix keeps a counter
 * document and the increment runs inside a transaction — two people registering
 * produce at the same desk must not land on the same storage ID, because that
 * ID ends up printed on a crate.
 */
export type ReferencePrefix = "ST" | "BK" | "WD" | "RC"

export async function nextReference(prefix: ReferencePrefix): Promise<string> {
  const counter = doc(db, COLLECTIONS.counters, prefix)

  const value = await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(counter)
    const current = snapshot.exists() ? ((snapshot.data().value as number) ?? 0) : 0
    const next = current + 1
    tx.set(counter, { value: next }, { merge: true })
    return next
  })

  return `${prefix}-${String(value).padStart(4, "0")}`
}
