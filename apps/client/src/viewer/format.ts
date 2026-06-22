/** Shared formatting helpers for the viewer header & turns. */

/** "14:02" style clock for a turn timestamp; '' when absent/invalid. */
export function formatClock(ts: string | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "2026-06-18 14:02" absolute timestamp; '' when absent/invalid. */
export function formatAbsolute(ts: string | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** "3 minutes ago" relative form; '' when absent/invalid. */
export function formatRelative(ts: string | undefined, now: number = Date.now()): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = now - d.getTime()
  const abs = Math.abs(diffMs)
  const sign = diffMs >= 0 ? 'ago' : 'from now'
  const sec = Math.round(abs / 1000)
  if (sec < 60) return `${sec}s ${sign}`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ${sign}`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ${sign}`
  const day = Math.round(hr / 24)
  return `${day}d ${sign}`
}

/** Human duration between two ISO timestamps, e.g. "38 min". */
export function formatDuration(
  start: string | undefined,
  end: string | undefined
): string {
  if (!start || !end) return ''
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return ''
  const sec = Math.round((b - a) / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const hr = Math.floor(min / 60)
  const rem = min % 60
  return rem ? `${hr}h ${rem}m` : `${hr}h`
}

/** Compact "X lines · Y chars" size indicator for collapsible bodies. */
export function sizeIndicator(text: string): string {
  const lines = text.length === 0 ? 0 : text.split('\n').length
  const chars = text.length
  return `${lines.toLocaleString()} lines · ${chars.toLocaleString()} chars`
}

/** Word count for thinking-block labels. */
export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

/** Stringify arbitrary tool input/output safely. */
export function stringifyValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
