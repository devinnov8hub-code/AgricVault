import { useQuery, useQueryClient } from "@tanstack/react-query"
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore"
import { useEffect } from "react"

import { db, fromSnapshot } from "@/lib/firebase"
import { keys } from "@/lib/query-client"
import { COLLECTIONS, type Alert, type SensorReading } from "@/types/models"

export const READINGS_PAGE_SIZE = 8
const SERIES_CAP = 400

/**
 * Everything in this file is ADMIN ONLY.
 *
 * The Firestore rules reject a read of sensorReadings or alerts from anyone
 * whose profile is not an active admin, so a farmer calling these hooks gets a
 * permission error rather than data. The farmer-facing equivalent is
 * useStorageConditions in features/facility/queries.ts, which returns a verdict
 * and no numbers.
 */

export function useLatestReading() {
  return useQuery({
    queryKey: keys.latestReading,
    staleTime: 15_000,
    queryFn: async (): Promise<SensorReading | null> => {
      const { getDocs } = await import("firebase/firestore")
      const snapshot = await getDocs(
        query(collection(db, COLLECTIONS.sensorReadings), orderBy("recordedAt", "desc"), limit(1)),
      )
      const first = snapshot.docs[0]
      return first ? fromSnapshot<SensorReading>(first) : null
    },
  })
}

export function useReadings(page: number) {
  return useQuery({
    queryKey: keys.readings(page),
    queryFn: async (): Promise<{ rows: SensorReading[]; total: number }> => {
      const { getDocs } = await import("firebase/firestore")
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.sensorReadings),
          orderBy("recordedAt", "desc"),
          limit(SERIES_CAP),
        ),
      )
      const all = snapshot.docs.map((row) => fromSnapshot<SensorReading>(row))
      const start = (page - 1) * READINGS_PAGE_SIZE
      return { rows: all.slice(start, start + READINGS_PAGE_SIZE), total: all.length }
    },
  })
}

/** Readings over a window, oldest first, for the charts. */
export function useReadingSeries(hours: number) {
  return useQuery({
    queryKey: keys.readingsSeries(hours),
    queryFn: async (): Promise<SensorReading[]> => {
      const { getDocs } = await import("firebase/firestore")
      const since = new Date(Date.now() - hours * 3_600_000).toISOString()

      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.sensorReadings),
          where("recordedAt", ">=", since),
          orderBy("recordedAt"),
          limit(SERIES_CAP),
        ),
      )
      return snapshot.docs.map((row) => fromSnapshot<SensorReading>(row))
    },
  })
}

export function useOpenAlerts(cap = 10) {
  return useQuery({
    queryKey: keys.alerts("open"),
    queryFn: async (): Promise<Alert[]> => {
      const { getDocs } = await import("firebase/firestore")
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTIONS.alerts),
          where("status", "==", "open"),
          orderBy("raisedAt", "desc"),
          limit(cap),
        ),
      )
      return snapshot.docs.map((row) => fromSnapshot<Alert>(row))
    },
  })
}

/**
 * Keep this tab in step with the database.
 *
 * The sync route writes a reading and every open admin screen hears about it
 * through onSnapshot, without polling. Only admins can subscribe — the rules
 * apply to listeners exactly as they do to one-off reads.
 */
export function useLiveClimate(enabled: boolean) {
  const client = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const unsubscribeReadings = onSnapshot(
      query(collection(db, COLLECTIONS.sensorReadings), orderBy("recordedAt", "desc"), limit(1)),
      () => {
        void client.invalidateQueries({ queryKey: ["readings"] })
      },
      // A listener that errors (offline, or a farmer somehow reaching here)
      // should not take the page down with it.
      (error) => console.warn("Climate listener stopped:", error.message),
    )

    const unsubscribeAlerts = onSnapshot(
      query(collection(db, COLLECTIONS.alerts), where("status", "==", "open"), limit(20)),
      () => {
        void client.invalidateQueries({ queryKey: ["alerts"] })
        void client.invalidateQueries({ queryKey: keys.dashboard })
      },
      (error) => console.warn("Alert listener stopped:", error.message),
    )

    return () => {
      unsubscribeReadings()
      unsubscribeAlerts()
    }
  }, [enabled, client])
}
