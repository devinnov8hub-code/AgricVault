import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { time } from "@/lib/format"
import type { SensorReading } from "@/types/models"

/** One brand colour for the primary series, one neutral for the secondary. */
const BRAND = "#6A3A8C"
const BRAND_SOFT = "#9D5CCB"
const NEUTRAL = "#A1A1AC"
const LINE = "#E8E8EC"
const INK_MUTED = "#71717D"

const axis = {
  tickLine: false,
  axisLine: false,
  tick: { fill: INK_MUTED, fontSize: 11, fontFamily: "IBM Plex Mono, monospace" },
} as const

export interface ClimateChartProps {
  readings: SensorReading[]
  /** The configured band; drawn as a tinted comfort zone behind the series. */
  band?: { min: number; max: number }
  metric: "temperature" | "humidity"
  height?: number
}

export function ClimateChart({ readings, band, metric, height = 220 }: ClimateChartProps) {
  const isTemperature = metric === "temperature"

  const data = readings.map((reading) => ({
    at: time(reading.recordedAt),
    value: isTemperature ? reading.temperatureC : reading.humidityPct,
  }))

  const values = data.map((point) => point.value)
  const lowest = values.length ? Math.min(...values, band?.min ?? Infinity) : 0
  const highest = values.length ? Math.max(...values, band?.max ?? -Infinity) : 100
  const padding = Math.max(1, (highest - lowest) * 0.2)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND_SOFT} stopOpacity={0.24} />
              <stop offset="100%" stopColor={BRAND_SOFT} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={LINE} vertical={false} />

          {band && (
            <ReferenceArea
              y1={band.min}
              y2={band.max}
              fill={NEUTRAL}
              fillOpacity={0.08}
              strokeOpacity={0}
            />
          )}

          <XAxis dataKey="at" interval="preserveStartEnd" minTickGap={32} {...axis} />
          <YAxis
            domain={[Math.floor(lowest - padding), Math.ceil(highest + padding)]}
            width={44}
            {...axis}
          />

          <Tooltip
            cursor={{ stroke: LINE }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${LINE}`,
              fontSize: 12,
              fontFamily: "Archivo, sans-serif",
              boxShadow: "0 8px 24px -8px rgb(24 24 28 / 0.16)",
            }}
            formatter={(value) => [
              `${Number(value)}${isTemperature ? "°C" : "%"}`,
              isTemperature ? "Temperature" : "Humidity",
            ]}
          />

          <Area
            dataKey="value"
            type="monotone"
            stroke={BRAND}
            strokeWidth={2}
            fill={`url(#fill-${metric})`}
            dot={false}
            activeDot={{ r: 3, fill: BRAND }}
          />

          {band && (
            <>
              <Line
                dataKey={() => band.max}
                stroke={NEUTRAL}
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
              />
              <Line
                dataKey={() => band.min}
                stroke={NEUTRAL}
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
