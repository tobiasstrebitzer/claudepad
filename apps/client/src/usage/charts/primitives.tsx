// @/usage/charts - primitives.tsx
//
// Hand-rolled bits that Recharts doesn't cover: the weekday x hour heatmap and
// the inline proportion bars in the project table. Colors come from design
// tokens (--accent, --data-N, --border) so the no-raw-hex + contrast gates hold.

import * as React from 'react'

/**
 * Weekday x hour intensity grid (FR-12). Cell opacity scales with activity; the
 * fill is the accent token, so it tracks the theme.
 */
export function HeatGrid({
  grid,
  ariaLabel
}: {
  grid: number[][]
  ariaLabel: string
}): React.JSX.Element {
  const max = Math.max(1, ...grid.flat())
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  // Hour ticks every 6h (0, 6, 12, 18) so the columns are readable.
  const ticks = [0, 6, 12, 18]
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-[2px]">
      <div className="flex items-center gap-[2px]">
        <span className="w-8 shrink-0" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="flex-1 text-center text-[9px] leading-none text-muted-foreground">
            {ticks.includes(h) ? `${String(h).padStart(2, '0')}` : ''}
          </span>
        ))}
      </div>
      {grid.map((row, d) => (
        <div key={d} className="flex items-center gap-[2px]">
          <span className="w-8 shrink-0 text-[10px] text-muted-foreground">{days[d]}</span>
          {row.map((v, h) => (
            <div
              key={h}
              className="h-3 flex-1 rounded-[2px] bg-accent"
              style={{ opacity: v === 0 ? 0.06 : 0.18 + 0.82 * (v / max) }}
              title={`${days[d]} ${String(h).padStart(2, '0')}:00 - ${v} message${v === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      ))}
      <div className="mt-1 pl-8 text-[10px] text-muted-foreground">hour of day (local)</div>
    </div>
  )
}

/** A single horizontal proportion bar (project table, model breakdown). */
export function HBar({
  fraction,
  color,
  ariaLabel
}: {
  fraction: number
  color: string
  ariaLabel?: string
}): React.JSX.Element {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-label={ariaLabel}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, backgroundColor: color }}
      />
    </div>
  )
}
