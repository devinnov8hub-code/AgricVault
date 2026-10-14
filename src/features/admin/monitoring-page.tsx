import { useState } from "react"

import { adminNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card"
import { Select } from "@/components/ui/field"
import { DataTable, EmptyState, Pagination, type Column } from "@/components/ui/table"
import { useDevices, useThresholds } from "@/features/facility/queries"
import { ClimateChart } from "@/features/monitoring/climate-chart"
import { DevicePanel } from "@/features/monitoring/device-panel"
import {
  READINGS_PAGE_SIZE,
  useLatestReading,
  useLiveClimate,
  useReadingSeries,
  useReadings,
} from "@/features/monitoring/queries"
import { celsius, percent, relativeDateTime } from "@/lib/format"
import type { SensorReading } from "@/types/models"

const WINDOWS = [
  { value: 6, label: "Last 6 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: 72, label: "Last 3 days" },
  { value: 168, label: "Last 7 days" },
]

export default function AdminMonitoringPage() {
  useLiveClimate(true)

  const [hours, setHours] = useState(24)
  const [page, setPage] = useState(1)

  const { data: settings } = useThresholds()
  const { data: devices = [] } = useDevices()
  const { data: latest } = useLatestReading()
  const { data: series = [] } = useReadingSeries(hours)
  const { data: table, isLoading } = useReadings(page)

  const tempBand = settings
    ? { min: settings.temperatureMinC, max: settings.temperatureMaxC }
    : undefined
  const humidityBand = settings
    ? { min: settings.humidityMinPct, max: settings.humidityMaxPct }
    : undefined

  const inBand = (value: number, band?: { min: number; max: number }) =>
    !band || (value >= band.min && value <= band.max)

  const columns: Array<Column<SensorReading>> = [
    {
      key: "room",
      header: "Room",
      render: (row) => <span className="mono text-xs">{row.unitCode}</span>,
    },
    {
      key: "temperature",
      header: "Temperature",
      numeric: true,
      render: (row) => (
        <span className={inBand(row.temperatureC, tempBand) ? undefined : "text-critical"}>
          {celsius(row.temperatureC)}
        </span>
      ),
    },
    {
      key: "humidity",
      header: "Humidity",
      numeric: true,
      render: (row) => (
        <span className={inBand(row.humidityPct, humidityBand) ? undefined : "text-critical"}>
          {percent(row.humidityPct)}
        </span>
      ),
    },
    {
      key: "battery",
      header: "Battery",
      numeric: true,
      render: (row) => (row.batteryPct === null ? "—" : percent(row.batteryPct)),
    },
    { key: "time", header: "Time", render: (row) => relativeDateTime(row.recordedAt) },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const ok = inBand(row.temperatureC, tempBand) && inBand(row.humidityPct, humidityBand)
        return (
          <Badge tone={ok ? "ok" : "critical"} dot>
            {ok ? "Good" : "Out of band"}
          </Badge>
        )
      },
    },
  ]

  return (
    <AppShell
      nav={adminNav}
      title="Temperature & humidity"
      subtitle="Live readings from every cold room"
      action={
        <div className="w-40">
          <Select
            aria-label="Time window"
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            options={WINDOWS}
          />
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Temperature now"
          value={latest ? celsius(latest.temperatureC) : "—"}
          hint={tempBand ? `Band ${tempBand.min}–${tempBand.max}°C` : undefined}
          icon="thermostat"
        />
        <Stat
          label="Humidity now"
          value={latest ? percent(latest.humidityPct) : "—"}
          hint={humidityBand ? `Band ${humidityBand.min}–${humidityBand.max}%` : undefined}
          icon="humidity_percentage"
        />
        <Stat
          label="Last reading"
          value={latest ? relativeDateTime(latest.recordedAt) : "—"}
          hint="Logged automatically"
          icon="schedule"
        />
      </div>

      <DevicePanel devices={devices} settings={settings ?? null} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Temperature" description="Shaded band is the configured range" />
          <CardBody>
            {series.length === 0 ? (
              <EmptyState title="No readings in this window" icon="sensors_off" />
            ) : (
              <ClimateChart readings={series} metric="temperature" band={tempBand} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Humidity" description="Shaded band is the configured range" />
          <CardBody>
            {series.length === 0 ? (
              <EmptyState title="No readings in this window" icon="sensors_off" />
            ) : (
              <ClimateChart readings={series} metric="humidity" band={humidityBand} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Latest readings" />
        <DataTable
          columns={columns}
          rows={table?.rows ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <EmptyState
              title="No readings yet"
              description="A sensor posts to the ingest endpoint to start the log."
              icon="sensors_off"
            />
          }
        />
        <Pagination
          page={page}
          pageSize={READINGS_PAGE_SIZE}
          total={table?.total ?? 0}
          noun="readings"
          onChange={setPage}
        />
      </Card>
    </AppShell>
  )
}
