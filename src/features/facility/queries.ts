import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore"

import { db, fromSnapshot, nowIso } from "@/lib/firebase"
import { keys } from "@/lib/query-client"
import {
  COLLECTIONS,
  CONFIG_DOCS,
  type ConditionsDoc,
  type Device,
  type FacilityConfig,
  type StorageUnit,
  type ThresholdConfig,
} from "@/types/models"

/* -- Facility -------------------------------------------------------------- */

/**
 * config/facility — name, capacity, tariff, produce list.
 *
 * Readable by anyone signed in, which is why the climate thresholds are NOT
 * here. A farmer needs the price; they must never see the hardware settings.
 */
export function useFacility() {
  return useQuery({
    queryKey: keys.facility,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FacilityConfig | null> => {
      const snapshot = await getDoc(doc(db, COLLECTIONS.config, CONFIG_DOCS.facility))
      return snapshot.exists() ? (snapshot.data() as FacilityConfig) : null
    },
  })
}

/** config/thresholds — ADMIN ONLY. The rules reject a farmer reading this. */
export function useThresholds() {
  return useQuery({
    queryKey: keys.settings,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ThresholdConfig | null> => {
      const snapshot = await getDoc(doc(db, COLLECTIONS.config, CONFIG_DOCS.thresholds))
      return snapshot.exists() ? (snapshot.data() as ThresholdConfig) : null
    },
  })
}

/**
 * The farmer-facing verdict on storage conditions.
 *
 * A single word and a timestamp, written by the sync route. This is the whole
 * reason a farmer can be told "your produce is being kept properly" without the
 * app ever handing them a temperature.
 */
export function useStorageConditions(enabled = true) {
  return useQuery({
    queryKey: keys.conditions,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ConditionsDoc> => {
      const snapshot = await getDoc(doc(db, COLLECTIONS.config, CONFIG_DOCS.conditions))
      return snapshot.exists()
        ? (snapshot.data() as ConditionsDoc)
        : { verdict: "unknown", checkedAt: null }
    },
  })
}

export function useSaveFacility() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<FacilityConfig>) => {
      await setDoc(
        doc(db, COLLECTIONS.config, CONFIG_DOCS.facility),
        { ...patch, updatedAt: nowIso() },
        { merge: true },
      )
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.facility })
      void client.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useSaveThresholds() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<ThresholdConfig>) => {
      await setDoc(
        doc(db, COLLECTIONS.config, CONFIG_DOCS.thresholds),
        { ...patch, updatedAt: nowIso() },
        { merge: true },
      )
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  })
}

/* -- Cold rooms and devices ------------------------------------------------ */

export function useStorageUnits() {
  return useQuery({
    queryKey: keys.units,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StorageUnit[]> => {
      const snapshot = await getDocs(
        query(collection(db, COLLECTIONS.storageUnits), orderBy("code")),
      )
      return snapshot.docs.map((row) => fromSnapshot<StorageUnit>(row))
    },
  })
}

/** The sensor rigs and their last contact. ADMIN ONLY under the rules. */
export function useDevices() {
  return useQuery({
    queryKey: keys.devices,
    queryFn: async (): Promise<Device[]> => {
      const snapshot = await getDocs(
        query(collection(db, COLLECTIONS.devices), orderBy("deviceId")),
      )
      return snapshot.docs.map((row) => fromSnapshot<Device>(row))
    },
  })
}

/* -- Produce --------------------------------------------------------------- */

/** Produce is a string array on the facility doc — it is a short pick list. */
export function useProduceTypes() {
  const { data: facility } = useFacility()
  return facility?.produce ?? []
}

export function useAddProduce() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ current, name }: { current: string[]; name: string }) => {
      const trimmed = name.trim()
      if (!trimmed) return
      if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return

      await updateDoc(doc(db, COLLECTIONS.config, CONFIG_DOCS.facility), {
        produce: [...current, trimmed],
        updatedAt: nowIso(),
      })
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.facility }),
  })
}

/* -- Dashboard overview ---------------------------------------------------- */

export interface FacilityOverview {
  capacityKg: number
  storedKg: number
  utilisationPct: number
  activeFarmers: number
  openAlerts: number
  pendingWithdrawals: number
}

/**
 * The headline numbers on the admin dashboard.
 *
 * Postgres computed these in a view. Here the four collections are counted in
 * parallel with Firestore's aggregate count queries where a count is all we
 * need, which keeps the read cost flat rather than paying per document.
 */
export function useFacilityOverview() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: async (): Promise<FacilityOverview> => {
      const { getCountFromServer, limit, where } = await import("firebase/firestore")

      const [facilitySnap, batches, farmers, alerts, withdrawals] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.config, CONFIG_DOCS.facility)),
        getDocs(query(collection(db, COLLECTIONS.storageBatches), limit(500))),
        getCountFromServer(
          query(
            collection(db, COLLECTIONS.profiles),
            where("role", "==", "farmer"),
            where("status", "==", "active"),
          ),
        ),
        getCountFromServer(
          query(collection(db, COLLECTIONS.alerts), where("status", "==", "open")),
        ),
        getCountFromServer(
          query(collection(db, COLLECTIONS.withdrawalRequests), where("status", "==", "pending")),
        ),
      ])

      const capacityKg = facilitySnap.exists()
        ? ((facilitySnap.data() as FacilityConfig).capacityKg ?? 0)
        : 0

      const storedKg = batches.docs
        .map((row) => row.data() as { availableKg: number; status: string })
        .filter((batch) => batch.status === "stored" || batch.status === "partially_withdrawn")
        .reduce((sum, batch) => sum + (batch.availableKg ?? 0), 0)

      return {
        capacityKg,
        storedKg,
        utilisationPct: capacityKg > 0 ? Math.round((storedKg / capacityKg) * 1000) / 10 : 0,
        activeFarmers: farmers.data().count,
        openAlerts: alerts.data().count,
        pendingWithdrawals: withdrawals.data().count,
      }
    },
  })
}
