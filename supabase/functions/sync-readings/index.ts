/**
 * sync-readings
 *
 * The embedded side owns Firebase. The rig writes one node per cold room:
 *
 *   store_001/
 *     data/      { onionStorageId, temp, humidity, isActive, timestamp }
 *     settings/  { highTempThreshold, lowTempThreshold,
 *                  highHumThreshold,  lowHumThreshold }
 *
 * Firebase holds only the latest value — it is a live register, not a history.
 * This pulls that register over the RTDB REST API and appends it to
 * sensor_readings, which is where history, charting and alerting live. The
 * alert itself is raised by the database trigger, exactly as it is for a
 * reading posted straight to ingest-reading.
 *
 * Nothing here is reachable from the browser, and no Firebase credential ever
 * reaches the client bundle.
 *
 * Run it on a schedule — every 5 minutes is plenty for a cold room:
 *
 *   select cron.schedule(
 *     'sync-readings', '*''/5 * * * *',
 *     $$ select net.http_post(
 *          url     := '<project-url>/functions/v1/sync-readings',
 *          headers := '{"x-sync-key":"<SYNC_KEY>"}'::jsonb
 *        ) $$);
 *
 * POST /functions/v1/sync-readings
 *   headers: x-sync-key: <SYNC_KEY>
 */

import { fail, json, preflight, requireEnv } from "../_shared/http.ts"
import { adminClient } from "../_shared/supabase.ts"

/** The shape the rig writes. Everything is treated as untrusted. */
interface DeviceNode {
  data?: {
    onionStorageId?: string
    temp?: number | string
    humidity?: number | string
    isActive?: boolean
    timestamp?: string
  }
  settings?: {
    highTempThreshold?: number | string
    lowTempThreshold?: number | string
    highHumThreshold?: number | string
    lowHumThreshold?: number | string
  }
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null
}

/** Readings older than this are treated as the rig having gone quiet. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000

Deno.serve(async (request) => {
  const early = preflight(request)
  if (early) return early

  if (request.method !== "POST") return fail(request, "Use POST.", 405)
  if (request.headers.get("x-sync-key") !== requireEnv("SYNC_KEY")) {
    return fail(request, "Not authorised.", 401)
  }

  const base = requireEnv("FIREBASE_DB_URL").replace(/\/$/, "")
  const secret = Deno.env.get("FIREBASE_DB_SECRET")
  const auth = secret ? `?auth=${encodeURIComponent(secret)}` : ""

  const db = adminClient()

  const { data: devices, error: devicesError } = await db
    .from("devices")
    .select("id, device_id, unit:storage_units(id, code)")

  if (devicesError) return fail(request, "Could not list devices.", 500, devicesError.message)
  if (!devices?.length) return json(request, { synced: [], note: "No device is mapped yet." })

  const results: Array<Record<string, unknown>> = []

  for (const device of devices) {
    const deviceId = device.device_id as string
    const unit = (device as unknown as { unit: { id: string; code: string } | null }).unit
    if (!unit) continue

    let node: DeviceNode
    try {
      const response = await fetch(`${base}/${encodeURIComponent(deviceId)}.json${auth}`)
      if (!response.ok) {
        results.push({ device: deviceId, ok: false, error: `Firebase responded ${response.status}` })
        continue
      }
      node = ((await response.json()) ?? {}) as DeviceNode
    } catch (cause) {
      results.push({
        device: deviceId,
        ok: false,
        error: cause instanceof Error ? cause.message : "Firebase request failed",
      })
      continue
    }

    const temperature = num(node.data?.temp)
    const humidity = num(node.data?.humidity)

    // Mirror the thresholds the rig is running, so an operator can see when the
    // hardware and the app disagree. Alerting still uses facility_settings.
    // Humidity thresholds are whole percentage points on both sides of the
    // bridge, so a legacy 55.56 in Firebase lands here as 56 rather than
    // showing an operator a precision the rig does not actually act on.
    const whole = (value: unknown) => {
      const parsed = num(value)
      return parsed === null ? null : Math.round(parsed)
    }

    const thresholds = node.settings
      ? {
          highTempThreshold: num(node.settings.highTempThreshold),
          lowTempThreshold: num(node.settings.lowTempThreshold),
          highHumThreshold: whole(node.settings.highHumThreshold),
          lowHumThreshold: whole(node.settings.lowHumThreshold),
        }
      : null

    if (temperature === null || humidity === null) {
      await db
        .from("devices")
        .update({ online: false, thresholds })
        .eq("id", device.id)

      results.push({ device: deviceId, ok: false, error: "No usable reading on the node." })
      continue
    }

    const stamped = node.data?.timestamp ? new Date(node.data.timestamp) : new Date()
    const recordedAt = Number.isNaN(stamped.getTime()) ? new Date() : stamped
    const fresh = Date.now() - recordedAt.getTime() < STALE_AFTER_MS

    // The rig republishes the same node between readings, so the same instant
    // arrives repeatedly. ignoreDuplicates keeps the log append-only and makes
    // this safe to run as often as you like.
    const { data: inserted, error: insertError } = await db
      .from("sensor_readings")
      .upsert(
        {
          unit_id: unit.id,
          temperature_c: temperature,
          humidity_pct: humidity,
          recorded_at: recordedAt.toISOString(),
        },
        { onConflict: "unit_id,recorded_at", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle()

    if (insertError) {
      results.push({ device: deviceId, ok: false, error: insertError.message })
      continue
    }

    await db
      .from("devices")
      .update({
        online: node.data?.isActive !== false && fresh,
        last_seen_at: recordedAt.toISOString(),
        thresholds,
      })
      .eq("id", device.id)

    results.push({
      device: deviceId,
      room: unit.code,
      ok: true,
      stored: Boolean(inserted),
      duplicate: !inserted,
      recordedAt: recordedAt.toISOString(),
    })
  }

  return json(request, { synced: results })
})
