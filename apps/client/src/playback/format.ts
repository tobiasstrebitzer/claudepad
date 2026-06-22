// Virtual-time clock formatting for the transport bar (PRD-08 §4.2). Shows
// playback time *after* pacing transforms - not the original session wall-clock.

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "idle 4m 12s → 0.8s" tooltip text for a collapsed idle-gap marker (FR-11). */
export function formatIdle(originalSeconds: number, collapsedSeconds: number): string {
  const human = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return s ? `${m}m ${s}s` : `${m}m`
  }
  return `idle ${human(originalSeconds)} → ${collapsedSeconds}s`
}
