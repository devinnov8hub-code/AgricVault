import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore"

import { db, fromSnapshot, nowIso } from "@/lib/firebase"
import { keys } from "@/lib/query-client"
import { nextReference } from "@/lib/references"
import { COLLECTIONS, type Profile, type StorageBatch } from "@/types/models"

export const PAGE_SIZE = 10

/**
 * Searching and paging, Firestore-style.
 *
 * Firestore has no `ilike` and no offset paging, so each list is fetched once
 * with a generous cap and then filtered and sliced in memory. For a single
 * cold store — hundreds of batches, not millions — this is both simpler and
 * faster than cursor paging, and it keeps substring search working.
 *
 * If this facility ever grows past a few thousand records, move search to a
 * dedicated index (Algolia, Typesense) rather than trying to make Firestore
 * do it.
 */
const FETCH_CAP = 500

export interface Page<Row> {
  rows: Row[]
  total: number
}

function paginate<Row>(rows: Row[], page: number, size = PAGE_SIZE): Page<Row> {
  const start = (page - 1) * size
  return { rows: rows.slice(start, start + size), total: rows.length }
}

/* -- Batches --------------------------------------------------------------- */

async function fetchBatches(): Promise<StorageBatch[]> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.storageBatches),
      orderBy("storedAt", "desc"),
      limit(FETCH_CAP),
    ),
  )
  return snapshot.docs.map((row) => fromSnapshot<StorageBatch>(row))
}

/** Every batch in the facility. Admin screens only. */
export function useBatches(search: string, page: number) {
  return useQuery({
    queryKey: keys.batches(search, page),
    queryFn: async (): Promise<Page<StorageBatch>> => {
      const all = await fetchBatches()
      const term = search.trim().toLowerCase()

      const matched = term
        ? all.filter(
            (batch) =>
              batch.reference.toLowerCase().includes(term) ||
              batch.farmerName.toLowerCase().includes(term),
          )
        : all

      return paginate(matched, page)
    },
  })
}

/**
 * The signed-in farmer's own batches.
 *
 * The `where` is not decoration — the security rules only permit a query that
 * filters on farmerId, so an unfiltered read is rejected by the server rather
 * than quietly returning everyone's produce.
 */
export function useMyBatches(farmerId: string | undefined) {
  return useQuery({
    queryKey: keys.myBatches,
    enabled: Boolean(farmerId),
    queryFn: async (): Promise<StorageBatch[]> => {
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.storageBatches),
          where("farmerId", "==", farmerId),
          orderBy("expiresAt"),
        ),
      )
      return snapshot.docs
        .map((row) => fromSnapshot<StorageBatch>(row))
        .filter((batch) => batch.status !== "withdrawn")
    },
  })
}

/* -- Farmer directory ------------------------------------------------------ */

export interface DirectoryRow extends Profile {
  storedKg: number
  balanceKobo: number
  units: string
}

/**
 * The admin user list, with stored weight and outstanding balance.
 *
 * Postgres did this with a view and two joins. Here the three collections are
 * read in parallel and stitched in memory — still one round trip's worth of
 * latency, and the alternative (totals denormalised onto each profile) would
 * need every payment write to touch the profile too.
 */
export function useUserDirectory(search: string, page: number) {
  return useQuery({
    queryKey: keys.users(search, page),
    queryFn: async (): Promise<Page<DirectoryRow>> => {
      const [profiles, batches, payments] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.profiles), where("role", "==", "farmer"))),
        getDocs(query(collection(db, COLLECTIONS.storageBatches), limit(FETCH_CAP))),
        getDocs(query(collection(db, COLLECTIONS.payments), limit(FETCH_CAP))),
      ])

      const storedByFarmer = new Map<string, number>()
      const unitsByFarmer = new Map<string, Set<string>>()

      for (const row of batches.docs) {
        const batch = fromSnapshot<StorageBatch>(row)
        if (batch.status === "withdrawn") continue
        storedByFarmer.set(
          batch.farmerId,
          (storedByFarmer.get(batch.farmerId) ?? 0) + batch.availableKg,
        )
        const set = unitsByFarmer.get(batch.farmerId) ?? new Set<string>()
        set.add(batch.unitCode)
        unitsByFarmer.set(batch.farmerId, set)
      }

      const balanceByFarmer = new Map<string, number>()
      for (const row of payments.docs) {
        const payment = row.data() as { farmerId: string; balanceKobo: number }
        balanceByFarmer.set(
          payment.farmerId,
          (balanceByFarmer.get(payment.farmerId) ?? 0) + (payment.balanceKobo ?? 0),
        )
      }

      const rows: DirectoryRow[] = profiles.docs
        .map((row) => fromSnapshot<Profile>(row))
        .map((profile) => ({
          ...profile,
          storedKg: storedByFarmer.get(profile.id) ?? 0,
          balanceKobo: balanceByFarmer.get(profile.id) ?? 0,
          units: [...(unitsByFarmer.get(profile.id) ?? [])].sort().join(", ") || "—",
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))

      const term = search.trim().toLowerCase()
      const matched = term
        ? rows.filter(
            (row) =>
              row.fullName.toLowerCase().includes(term) ||
              row.email.toLowerCase().includes(term) ||
              (row.phone ?? "").includes(term),
          )
        : rows

      return paginate(matched, page)
    },
  })
}

/* -- Intake ---------------------------------------------------------------- */

export interface NewBatch {
  farmer: Pick<Profile, "id" | "fullName" | "phone">
  unit: { id: string; code: string }
  produce: string | null
  intakeKg: number
  months: number
  createdBy: string
}

/** Take produce in: weigh it, tag it, and start the clock. */
export function useCreateBatch() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: NewBatch): Promise<StorageBatch> => {
      const reference = await nextReference("ST")

      const storedAt = new Date()
      const expiresAt = new Date(storedAt)
      expiresAt.setMonth(expiresAt.getMonth() + input.months)

      const batch: Omit<StorageBatch, "id"> = {
        reference,
        farmerId: input.farmer.id,
        farmerName: input.farmer.fullName,
        farmerPhone: input.farmer.phone,
        unitId: input.unit.id,
        unitCode: input.unit.code,
        produce: input.produce,
        bookingId: null,
        intakeKg: input.intakeKg,
        availableKg: input.intakeKg,
        storedAt: storedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: "stored",
        createdBy: input.createdBy,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      const created = await addDoc(collection(db, COLLECTIONS.storageBatches), batch)

      await addDoc(collection(db, COLLECTIONS.notifications), {
        recipientId: input.farmer.id,
        category: "storage",
        title: "Your produce is in storage",
        body: `${reference} — ${Math.round(input.intakeKg).toLocaleString("en-NG")} kg in ${input.unit.code}.`,
        link: "/farmer/dashboard",
        readAt: null,
        createdAt: serverTimestamp(),
      })

      return { id: created.id, ...batch }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["batches"] })
      void client.invalidateQueries({ queryKey: keys.dashboard })
      void client.invalidateQueries({ queryKey: ["users"] })
    },
  })
}
