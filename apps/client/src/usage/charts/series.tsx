// @/usage/charts - series.tsx
//
// Recharts-backed charts for Usage Insights (tooltips, axes, legends out of the
// box). All colors are design tokens (var(--data-N), var(--text-muted),
// var(--border)) so the no-raw-hex + contrast gates stay green; Recharts renders
// SVG and accepts CSS-var strings directly as fills/strokes.

import * as React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { DayPoint, ModelRow } from '../derive'
import { dataColor, formatCost, formatTokens, shortDay } from '../format'

const AXIS = { fontSize: 11, fill: 'var(--text-muted)' } as const
const GRID = 'var(--border)'

const KINDS = [
  { key: 'input', label: 'input', color: 'var(--data-1)' },
  { key: 'output', label: 'output', color: 'var(--data-2)' },
  { key: 'cacheWrite', label: 'cache write', color: 'var(--data-3)' },
  { key: 'cacheRead', label: 'cache read', color: 'var(--data-4)' }
] as const

type Fmt = (n: number) => string

interface TipItem {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
}
/**
 * Custom tooltip. Recharts injects `active`/`payload`/`label` when it clones the
 * element, so those are optional here and only `fmt` is supplied at the call
 * site (`content={<ChartTooltip fmt={...} />}`).
 */
function ChartTooltip({
  fmt,
  active,
  payload,
  label
}: {
  fmt: Fmt
  active?: boolean
  payload?: TipItem[]
  label?: string | number
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs shadow-[var(--shadow-md)]">
      {label !== undefined && <div className="mb-1 font-medium text-text">{label}</div>}
      {payload.map((p, i) => (
        <div key={String(p.dataKey ?? i)} className="flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums text-text">{fmt(Number(p.value) || 0)}</span>
        </div>
      ))}
    </div>
  )
}

export function TokenTrend({
  series,
  mode
}: {
  series: DayPoint[]
  mode: 'tokens' | 'cost'
}): React.JSX.Element {
  const data = series.map((d) => ({
    day: shortDay(d.day),
    input: d.totals.input,
    output: d.totals.output,
    cacheWrite: d.totals.cacheCreate,
    cacheRead: d.totals.cacheRead,
    cost: d.cost
  }))
  const fmt: Fmt = mode === 'cost' ? formatCost : formatTokens

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 3" vertical={false} />
          <XAxis dataKey="day" tick={AXIS} stroke={GRID} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS} stroke={GRID} width={44} tickFormatter={fmt} />
          <Tooltip cursor={{ fill: 'var(--accent-tint)' }} content={<ChartTooltip fmt={fmt} />} />
          {mode === 'cost' ? (
            <Bar dataKey="cost" name="cost" fill="var(--data-2)" radius={[2, 2, 0, 0]} />
          ) : (
            <>
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={9} />
              {KINDS.map((k) => (
                <Bar key={k.key} dataKey={k.key} name={k.label} stackId="t" fill={k.color} />
              ))}
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SessionHistogram({ values }: { values: number[] }): React.JSX.Element {
  const max = Math.max(1, ...values)
  const buckets = 12
  const counts = new Array<number>(buckets).fill(0)
  for (const v of values) counts[Math.min(buckets - 1, Math.floor((v / max) * buckets))]! += 1
  const data = counts.map((c, i) => ({
    bucket: formatTokens(((i + 0.5) / buckets) * max),
    count: c
  }))
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 3" vertical={false} />
          <XAxis dataKey="bucket" tick={AXIS} stroke={GRID} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={AXIS} stroke={GRID} width={28} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--accent-tint)' }}
            content={<ChartTooltip fmt={(n) => `${n} session${n === 1 ? '' : 's'}`} />}
          />
          <Bar dataKey="count" name="sessions" fill="var(--data-5)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ModelBars({ models }: { models: ModelRow[] }): React.JSX.Element {
  const data = models.map((m) => ({
    model: m.model.replace(/^claude-/, '').replace(/-\d{8}$/, ''),
    tokens: m.tokens
  }))
  const height = Math.max(80, data.length * 34)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 3" horizontal={false} />
          <XAxis type="number" tick={AXIS} stroke={GRID} tickFormatter={formatTokens} />
          <YAxis type="category" dataKey="model" tick={AXIS} stroke={GRID} width={96} />
          <Tooltip cursor={{ fill: 'var(--accent-tint)' }} content={<ChartTooltip fmt={formatTokens} />} />
          <Bar dataKey="tokens" name="tokens" radius={[0, 2, 2, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={dataColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
