// @/usage - format.ts
// Display formatting for the dashboard (compact tokens, dollars, hours) and the
// categorical color helper that maps a series index to a --data-N token.

export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${Math.round(n)}`
}

export function formatCount(n: number): string {
  return n.toLocaleString()
}

export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatHours(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k h`
  if (h >= 10) return `${Math.round(h)} h`
  return `${h.toFixed(1)} h`
}

const DATA_TOKENS = 6

/** A `var(--data-N)` color for series index `i` (wraps after 6). */
export function dataColor(i: number): string {
  return `var(--data-${(i % DATA_TOKENS) + 1})`
}

/** Short, human label for a `cwd` project key (last 1-2 path segments). */
export function shortProject(project: string): string {
  if (project === '(unknown)') return project
  const parts = project.split('/').filter(Boolean)
  return parts.slice(-1)[0] ?? project
}

/** `YYYY-MM-DD` -> a short month/day label for axis ticks. */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${m}/${d}`
}
