import { FieldValue } from "firebase-admin/firestore"

import { fail, json, preflight } from "./_shared/http.ts"
import { adminDb, adminRtdb, requireEnv } from "./_shared/firebase-admin.ts"

export const config = { runtime: "nodejs" }

/**
 * sync-readings — the bridge between the two halves of Firebase.
 *
 * The embedded rig owns the Realtime Database and writes one node per cold
 * room:
 *
 *   store_001/
 *     data/      { onionStorageId, temp, humidity, isActive, timestamp }
 *     settings/  { highTempThreshold, lowTempThreshold,
 *                  highHumThreshold,  lowHumThreshold }
 *
 * The RTDB holds only the LATEST value — it is a live register, not a history.
 * This route copies that register into Firestore, where it becomes a history
 * the charts and the alert log can use, raises alerts when a reading leaves
 * the configured band, and writes the one-word verdict farmers are allowed to
 * see.
 *
 * Call it on a schedule (vercel.json has it every 5 minutes) or by hand:
 *
 *   curl -X POST https://<your-app>.vercel.app/api/sync-readings \
 *     -H "x-sync-key: $SYNC_KEY"
 */

interface DeviceNode {
  data?: {
    onionStorageId?: string
    temp?: number | string
    humidity?: number | string
    isActive?: boolean
    timestamp?: string
  }
  settings?: Record<string, number | string | undefined>
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null
}

/** Humidity thresholds are whole percentage points on both sides of the bridge. */
const whole = (value: unknown): number | null => {
  const parsed = num(value)
  return parsed === null ? null : Math.round(parsed)
}

/** Beyond this, the rig is treated as having gone quiet. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000

/** How far outside the band a reading has to be before it is critical. */
const CRITICAL_GAP = 2

export default async function handler(request: Request): Promise<Response> {
  const early = preflight(request)
  if (early) return early

  if (request.method !== "POST" && request.method !== "GET") {
    return fail(request, "Use POST.", 405)
  }

  // Vercel Cron calls with a bearer secret; a manual call uses x-sync-key.
  const syncKey = requireEnv("SYNC_KEY")
  const provided =
    request.headers.get("x-sync-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")

  if (provided !== syncKey) return fail(request, "Not authorised.", 401)

  const db = adminDb()
  const rtdb = adminRtdb()

  const [devicesSnap, thresholdsSnap] = await Promise.all([
    db.collection("devices").get(),
    db.collection("config").doc("thresholds").get(),
  ])

  if (devicesSnap.empty) {
    return json(request, { synced: [], note: "No device is mapped yet." })
  }

  const bands = thresholdsSnap.exists
    ? (thresholdsSnap.data() as {
        temperatureMinC: number
        temperatureMaxC: number
        humidityMinPct: number
        humidityMaxPct: number
      })
    : null

  const results: Array<Record<string, unknown>> = []
  let worstVerdict: "in_range" | "out_of_range" | "stale" | "unknown" = "unknown"
  let newestReadingAt: string | null = null

  for (const deviceDoc of devicesSnap.docs) {
    const device = deviceDoc.data() as {
      deviceId: string
      unitId: string
      unitCode: string
    }

    let node: DeviceNode
    try {
      const snapshot = await rtdb.ref(device.deviceId).get()
      node = (snapshot.val() ?? {}) as DeviceNode
    } catch (cause) {
      results.push({
        device: device.deviceId,
        ok: false,
        error: cause instanceof Error ? cause.message : "Could not read the device node",
      })
      continue
    }

    const temperature = num(node.data?.temp)
    const humidity = num(node.data?.humidity)

    const thresholds = node.settings
      ? {
          highTempThreshold: num(node.settings.highTempThreshold),
          lowTempThreshold: num(node.settings.lowTempThreshold),
          highHumThreshold: whole(node.settings.highHumThreshold),
          lowHumThreshold: whole(node.settings.lowHumThreshold),
        }
      : null

    if (temperature === null || humidity === null) {
      await deviceDoc.ref.update({ online: false, thresholds })
      results.push({ device: device.deviceId, ok: false, error: "No usable reading on the node." })
      continue
    }

    const stamped = node.data?.timestamp ? new Date(node.data.timestamp) : new Date()
    const recordedAt = Number.isNaN(stamped.getTime()) ? new Date() : stamped
    const recordedIso = recordedAt.toISOString()
    const fresh = Date.now() - recordedAt.getTime() < STALE_AFTER_MS

    // The rig republishes the same node between readings, so the same instant
    // arrives repeatedly. A deterministic id makes this idempotent: running the
    // sync twice cannot double-log a reading.
    const readingId = `${device.deviceId}_${recordedIso}`
    const readingRef = db.collection("sensorReadings").doc(readingId)
    const existing = await readingRef.get()

    if (!existing.exists) {
      await readingRef.set({
        unitId: device.unitId,
        unitCode: device.unitCode,
        temperatureC: temperature,
        humidityPct: humidity,
        batteryPct: null,
        recordedAt: recordedIso,
      })

      if (bands) {
        await raiseAlerts({
          db,
          unitId: device.unitId,
          unitCode: device.unitCode,
          temperature,
          humidity,
          bands,
        })
      }
    }

    await deviceDoc.ref.update({
      online: node.data?.isActive !== false && fresh,
      lastSeenAt: recordedIso,
      thresholds,
    })

    // The verdict is the worst across all rooms: if one is out of band, the
    // facility is not keeping its promise, whatever the others say.
    const verdict = !fresh
      ? "stale"
      : !bands
        ? "unknown"
        : temperature >= bands.temperatureMinC &&
            temperature <= bands.temperatureMaxC &&
            humidity >= bands.humidityMinPct &&
            humidity <= bands.humidityMaxPct
          ? "in_range"
          : "out_of_range"

    worstVerdict = worsen(worstVerdict, verdict)
    if (!newestReadingAt || recordedIso > newestReadingAt) newestReadingAt = recordedIso

    results.push({
      device: device.deviceId,
      room: device.unitCode,
      ok: true,
      stored: !existing.exists,
      duplicate: existing.exists,
      recordedAt: recordedIso,
    })
  }

  // The farmer-facing verdict. One word and a timestamp — no numbers, which is
  // what keeps hardware data away from farmers while still telling them their
  // produce is being looked after.
  await db
    .collection("config")
    .doc("conditions")
    .set({ verdict: worstVerdict, checkedAt: newestReadingAt }, { merge: true })

  return json(request, { synced: results, verdict: worstVerdict })
}

const SEVERITY_ORDER = ["in_range", "unknown", "stale", "out_of_range"] as const

function worsen(
  current: (typeof SEVERITY_ORDER)[number],
  next: (typeof SEVERITY_ORDER)[number],
): (typeof SEVERITY_ORDER)[number] {
  return SEVERITY_ORDER.indexOf(next) > SEVERITY_ORDER.indexOf(current) ? next : current
}

/**
 * Raise an alert when a reading leaves the band, and tell every active admin.
 *
 * This is the Postgres trigger, rewritten. Firestore has no triggers without
 * Cloud Functions (which need a billing plan), so the sync route does it —
 * which is fine, because every reading arrives through here.
 */
async function raiseAlerts(input: {
  db: FirebaseFirestore.Firestore
  unitId: string
  unitCode: string
  temperature: number
  humidity: number
  bands: {
    temperatureMinC: number
    temperatureMaxC: number
    humidityMinPct: number
    humidityMaxPct: number
  }
}) {
  const { db, unitId, unitCode, temperature, humidity, bands } = input

  const raised: Array<{
    type: string
    severity: "warning" | "critical"
    title: string
    detail: string
  }> = []

  if (temperature > bands.temperatureMaxC) {
    raised.push({
      type: "temperature_high",
      severity: temperature > bands.temperatureMaxC + CRITICAL_GAP ? "critical" : "warning",
      title: "High temperature",
      detail: `${unitCode} read ${temperature}°C against a ${bands.temperatureMinC}–${bands.temperatureMaxC}°C band.`,
    })
  } else if (temperature < bands.temperatureMinC) {
    raised.push({
      type: "temperature_low",
      severity: temperature < bands.temperatureMinC - CRITICAL_GAP ? "critical" : "warning",
      title: "Low temperature",
      detail: `${unitCode} read ${temperature}°C against a ${bands.temperatureMinC}–${bands.temperatureMaxC}°C band.`,
    })
  }

  if (humidity > bands.humidityMaxPct) {
    raised.push({
      type: "humidity_high",
      severity: humidity > bands.humidityMaxPct + CRITICAL_GAP * 2 ? "critical" : "warning",
      title: "High humidity",
      detail: `${unitCode} read ${humidity}% against a ${bands.humidityMinPct}–${bands.humidityMaxPct}% band.`,
    })
  } else if (humidity < bands.humidityMinPct) {
    raised.push({
      type: "humidity_low",
      severity: humidity < bands.humidityMinPct - CRITICAL_GAP * 2 ? "critical" : "warning",
      title: "Low humidity",
      detail: `${unitCode} read ${humidity}% against a ${bands.humidityMinPct}–${bands.humidityMaxPct}% band.`,
    })
  }

  if (raised.length === 0) return

  // Do not re-raise something already open for the same room and reason: a rig
  // reporting every five minutes would otherwise bury the admin in duplicates.
  const open = await db.collection("alerts").where("status", "==", "open").get()
  const alreadyOpen = new Set(
    open.docs
      .map((row) => row.data() as { unitId: string; type: string })
      .filter((alert) => alert.unitId === unitId)
      .map((alert) => alert.type),
  )

  const fresh = raised.filter((alert) => !alreadyOpen.has(alert.type))
  if (fresh.length === 0) return

  const admins = await db
    .collection("profiles")
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .get()

  const batch = db.batch()
  const raisedAt = new Date().toISOString()

  for (const alert of fresh) {
    batch.set(db.collection("alerts").doc(), {
      unitId,
      unitCode,
      ...alert,
      status: "open",
      raisedAt,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
    })

    for (const admin of admins.docs) {
      batch.set(db.collection("notifications").doc(), {
        recipientId: admin.id,
        category: "alert",
        title: alert.title,
        body: alert.detail,
        link: "/admin/monitoring",
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }

  await batch.commit()
}
