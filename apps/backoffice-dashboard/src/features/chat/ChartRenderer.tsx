/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type FC, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useTheme } from '../../contexts/ThemeContext'

const COLORS = [
  '#22c55e',
  '#3b82f6',
  '#ef4444',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#e11d48',
  '#f59e0b',
  '#6366f1',
]

type ChartType = 'line' | 'bar' | 'area'

interface ChartRendererProps {
  type: ChartType
  data: Record<string, unknown>[]
}

export const ChartRenderer: FC<ChartRendererProps> = ({ type, data }) => {
  const { xKey, dataKeys } = useMemo(() => {
    if (data.length === 0) return { xKey: '', dataKeys: [] }
    const keys = Object.keys(data[0])
    return { xKey: keys[0], dataKeys: keys.slice(1) }
  }, [data])

  if (data.length === 0 || !xKey) return null

  const { theme } = useTheme()
  const tooltipStyle =
    theme === 'dark'
      ? { fontSize: 12, backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0' }
      : { fontSize: 12 }
  const showLegend = dataKeys.length > 1
  const showDots = data.length <= 50
  const xInterval = data.length > 20 ? Math.floor(data.length / 8) : 0

  return (
    <div className="my-3 w-full" style={{ maxHeight: 320 }}>
      <ResponsiveContainer width="100%" height={280}>
        {type === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10 }}
              interval={xInterval}
              angle={data.length > 12 ? -45 : 0}
              textAnchor={data.length > 12 ? 'end' : 'middle'}
              height={data.length > 12 ? 60 : 30}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        ) : type === 'area' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10 }}
              interval={xInterval}
              angle={data.length > 12 ? -45 : 0}
              textAnchor={data.length > 12 ? 'end' : 'middle'}
              height={data.length > 12 ? 60 : 30}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {dataKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.3}
                dot={showDots}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10 }}
              interval={xInterval}
              angle={data.length > 12 ? -45 : 0}
              textAnchor={data.length > 12 ? 'end' : 'middle'}
              height={data.length > 12 ? 60 : 30}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {dataKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                dot={showDots}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export function parseChartFromMarkdown(text: string): {
  before: string
  chart: { type: ChartType; data: Record<string, unknown>[] } | null
  after: string
  streaming?: boolean
} {
  const markerRegex = /<!--chart:(line|bar|area)-->\s*```json\s*\n([\s\S]*?)```/
  const match = text.match(markerRegex)

  if (!match) {
    const partialMarker = text.match(/<!--chart:(line|bar|area)-->/)
    if (partialMarker) {
      const before = text.substring(0, partialMarker.index ?? 0)
      return { before, chart: null, after: '', streaming: true }
    }
    return { before: text, chart: null, after: '' }
  }

  try {
    const type = match[1] as ChartType
    const data = JSON.parse(match[2])
    if (!Array.isArray(data)) return { before: text, chart: null, after: '' }

    const idx = match.index ?? 0
    const before = text.substring(0, idx)
    const after = text.substring(idx + match[0].length)
    return { before, chart: { type, data }, after }
  } catch {
    return { before: text, chart: null, after: '' }
  }
}
