import { Badge } from "@/components/ui/badge"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { EmptyState } from "@/components/ui/table"
import { relativeDateTime } from "@/lib/format"
import type { Device, ThresholdConfig } from "@/types/models"

/**
 * What the hardware is doing, as last read from Firebase — admin only.
 *
 * The rig carries its own copy of the thresholds. Alerting in AgriVault uses
 * the facility settings, so when the two drift apart the rig and the dashboard
 * disagree about what counts as a problem. That is worth saying out loud
 * rather than leaving someone to discover it during a spoilage.
 */
export function DevicePanel({
  devices,
  settings,
}: {
  devices: Device[]
  settings: ThresholdConfig | null
}) {
  return (
    <Card>
      <CardHeader
        icon="sensors"
        title="Sensor devices"
        description="Live status reported by the rig in each cold room."
      />
      <CardBody className="p-0">
        {devices.length === 0 ? (
          <EmptyState
            title="No device mapped yet"
            description="Map a cold room to the node ID the rig reports."
            icon="sensors_off"
          />
        ) : (
          <ul>
            {devices.map((device) => {
              const drift = thresholdDrift(device, settings)

              return (
                <li key={device.id} className="border-b border-line p-4 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                          device.online ? "bg-ok-soft text-ok" : "bg-critical-soft text-critical"
                        }`}
                      >
                        <Icon
                          name={device.online ? "sensors" : "sensors_off"}
                          className="text-base"
                        />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{device.unitCode}</p>
                        <p className="mono text-2xs text-ink-subtle">{device.deviceId}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="mono text-2xs text-ink-subtle">
                        {device.lastSeenAt
                          ? `Last seen ${relativeDateTime(device.lastSeenAt)}`
                          : "Never reported"}
                      </span>
                      <Badge tone={device.online ? "ok" : "critical"} dot>
                        {device.online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                  </div>

                  {device.thresholds && (
                    <dl className="flex flex-wrap gap-6 pt-4">
                      <Threshold
                        label="Device temp band"
                        value={range(
                          device.thresholds.lowTempThreshold,
                          device.thresholds.highTempThreshold,
                          "°C",
                        )}
                      />
                      <Threshold
                        label="Device humidity band"
                        value={range(
                          device.thresholds.lowHumThreshold,
                          device.thresholds.highHumThreshold,
                          "%",
                        )}
                      />
                    </dl>
                  )}

                  {drift && (
                    <p className="mt-3 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                      <Icon name="warning" className="shrink-0 text-base" />
                      {drift}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function Threshold({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs text-ink-muted">{label}</dt>
      <dd className="mono pt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}

const range = (low: number | null, high: number | null, unit: string) =>
  low === null || high === null ? "—" : `${low}–${high}${unit}`

/** A sentence naming the disagreement, or null when the two agree. */
function thresholdDrift(row: Device, settings: ThresholdConfig | null): string | null {
  const device = row.thresholds
  if (!device || !settings) return null

  const mismatched: string[] = []
  const differs = (a: number | null, b: number) => a !== null && Math.abs(a - b) > 0.01

  if (
    differs(device.lowTempThreshold, settings.temperatureMinC) ||
    differs(device.highTempThreshold, settings.temperatureMaxC)
  ) {
    mismatched.push(
      `temperature (device ${range(device.lowTempThreshold, device.highTempThreshold, "°C")}, app ${settings.temperatureMinC}–${settings.temperatureMaxC}°C)`,
    )
  }

  if (
    differs(device.lowHumThreshold, settings.humidityMinPct) ||
    differs(device.highHumThreshold, settings.humidityMaxPct)
  ) {
    mismatched.push(
      `humidity (device ${range(device.lowHumThreshold, device.highHumThreshold, "%")}, app ${settings.humidityMinPct}–${settings.humidityMaxPct}%)`,
    )
  }

  if (mismatched.length === 0) return null

  return `This device is running different thresholds from the app: ${mismatched.join(
    " and ",
  )}. AgriVault raises alerts on the app's values — align them in Settings, or have the device updated.`
}
