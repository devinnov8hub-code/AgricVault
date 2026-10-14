/**
 * ingest-reading
 *
 * The sensor rig in each cold room posts here. Writes land in sensor_readings
 * with the service role, which is why that table has no insert policy: nothing
 * holding a browser token can forge a reading.
 *
 * POST /functions/v1/ingest-reading
 *   headers: x-device-key: <shared secret>
 *   { "deviceId": "store_001", "temperatureC": 9.4, "humidityPct": 71.2,
 *     "batteryPct": 86, "recordedAt": "2026-10-13T14:05:00Z" }
 *
 * The alerting in the database does the rest: evaluate_reading raises an alert
 * when the reading leaves the configured band, and notify_admins_of_alert tells
 * every active admin.
 */

import { fail, json, preflight, requireEnv } from "../_shared/http.ts"
import { adminClient } from "../_shared/supabase.ts"

interface Body {
  deviceId?: string
  temperatureC?: number
  humidityPct?: number
  batteryPct?: number | null
  recordedAt?: string
}

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

Deno.serve(async (request) => {
  const early = preflight(request)
  if (early) return early

  if (request.method !== "POST") return fail(request, "Use POST.", 405)

  // Devices authenticate with a shared key, not a user session.
  if (request.headers.get("x-device-key") !== requireEnv("DEVICE_INGEST_KEY")) {
    return fail(request, "Unrecognised device.", 401)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail(request, "Body must be JSON.")
  }

  const temperature = number(body.temperatureC)
  const humidity = number(body.humidityPct)
  const battery = number(body.batteryPct)

  if (!body.deviceId) return fail(request, "deviceId is required.")
  if (temperature === null) return fail(request, "temperatureC must be a number.")
  if (humidity === null) return fail(request, "humidityPct must be a number.")
  if (temperature < -40 || temperature > 80) return fail(request, "temperatureC is out of range.")
  if (humidity < 0 || humidity > 100) return fail(request, "humidityPct is out of range.")

  const db = adminClient()

  const { data: device, error: deviceError } = await db
    .from("devices")
    .select("id, unit:storage_units(id, code)")
    .eq("device_id", body.deviceId)
    .maybeSingle()

  if (deviceError) return fail(request, "Could not look up the device.", 500, deviceError.message)

  const unit = (device as unknown as { unit: { id: string; code: string } | null } | null)?.unit
  if (!unit) return fail(request, `No cold room is mapped to device ${body.deviceId}.`, 404)

  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date()
  if (Number.isNaN(recordedAt.getTime())) return fail(request, "recordedAt is not a valid date.")

  const { data: reading, error } = await db
    .from("sensor_readings")
    .upsert(
      {
        unit_id: unit.id,
        temperature_c: temperature,
        humidity_pct: humidity,
        battery_pct: battery,
        recorded_at: recordedAt.toISOString(),
      },
      { onConflict: "unit_id,recorded_at", ignoreDuplicates: true },
    )
    .select("id, recorded_at")
    .maybeSingle()

  if (error) return fail(request, "Could not store the reading.", 500, error.message)

  await db
    .from("devices")
    .update({ online: true, last_seen_at: recordedAt.toISOString() })
    .eq("device_id", body.deviceId)

  return json(request, {
    stored: Boolean(reading),
    duplicate: !reading,
    unit: unit.code,
    readingId: reading?.id ?? null,
  })
})
