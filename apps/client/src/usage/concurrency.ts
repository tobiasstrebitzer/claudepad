// @/usage - concurrency.ts
//
// "How many sessions did I actually have running at once?" - the parallelism
// metric. Working across 3-5 projects at a time is the defining shape of agentic
// work, and none of the other cards can see it: a day with four sessions looks
// identical whether they ran back-to-back or all at once.
//
// Method: slice wall-clock into fixed slots and count the distinct top-level
// sessions running in each. A session counts as running in every slot between
// two consecutive turns that are less than BRIDGE_MS apart - so the thinking,
// tool-running and reading time between turns counts, but an overnight gap does
// not silently mark a session "running" until morning. Slots with nobody running
// are dropped, so the mean is over time spent working, not over the calendar.
//
// Deliberately quantized and honest: at a 5-minute resolution "concurrent" means
// "both had the floor within the same 5 minutes", which is the human sense of
// running things in parallel. Nothing here needs sub-slot precision.

import type { ConcurrencyStats } from './types'

/** Slot resolution. 5 min is fine enough to separate real overlap from tab-switching. */
export const SLOT_MS = 5 * 60_000

/**
 * Two turns closer than this are treated as one continuous run, and every slot
 * between them counts as active. Beyond it the session is considered parked -
 * the next turn starts a fresh run rather than back-filling the gap. 10 minutes
 * covers a normal read-the-output-and-reply pause without letting a session
 * loiter. The result is not sensitive to this knob: on a real 30-day vault,
 * sweeping it 5m -> 30m moved the mean only 1.59x -> 1.73x, so the number
 * reflects how the work actually ran, not where the threshold was drawn.
 */
export const BRIDGE_MS = 10 * 60_000

/** Highest concurrency level tracked individually; above this rolls into an `n+` bucket. */
export const MAX_LEVEL = 6

/** One participant's turn timestamps (epoch ms); order does not matter. */
export interface Timeline {
  /** Stable identity - the session or agent-run id. */
  id: string
  ts: number[]
}

/**
 * Slot indices a timeline occupies. A lone turn occupies its own slot; two turns
 * within BRIDGE_MS fill every slot between them.
 */
function slotsOf(ts: readonly number[]): Set<number> {
  const out = new Set<number>()
  if (ts.length === 0) return out
  const sorted = [...ts].sort((a, b) => a - b)
  let prev: number | undefined
  for (const t of sorted) {
    const slot = Math.floor(t / SLOT_MS)
    if (prev !== undefined && t - prev <= BRIDGE_MS) {
      for (let s = Math.floor(prev / SLOT_MS); s < slot; s++) out.add(s)
    }
    out.add(slot)
    prev = t
  }
  return out
}

/** Per-slot count of distinct participants, from a set of timelines. */
function occupancy(timelines: readonly Timeline[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const t of timelines) {
    for (const slot of slotsOf(t.ts)) {
      counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
  }
  return counts
}

export function emptyConcurrency(): ConcurrencyStats {
  return {
    slotMs: SLOT_MS,
    busySlots: 0,
    mean: 0,
    max: 0,
    histogram: new Array<number>(MAX_LEVEL + 1).fill(0),
    maxAgents: 0
  }
}

/**
 * Time-weighted concurrency over `sessions` (top-level only - delegated runs
 * would double-count the same wall-clock and inflate the number). `agents` is
 * measured separately, contributing only its peak.
 */
export function computeConcurrency(
  sessions: readonly Timeline[],
  agents: readonly Timeline[] = []
): ConcurrencyStats {
  const counts = occupancy(sessions)
  const stats = emptyConcurrency()
  if (counts.size === 0) {
    stats.maxAgents = peakOf(agents)
    return stats
  }

  let total = 0
  for (const n of counts.values()) {
    total += n
    if (n > stats.max) stats.max = n
    stats.histogram[Math.min(n, MAX_LEVEL)]! += 1
  }
  stats.busySlots = counts.size
  stats.mean = total / counts.size
  stats.maxAgents = peakOf(agents)
  return stats
}

function peakOf(timelines: readonly Timeline[]): number {
  let peak = 0
  for (const n of occupancy(timelines).values()) if (n > peak) peak = n
  return peak
}

/** Wall-clock actually spent working, in hours (busy slots x slot width). */
export function busyHours(stats: ConcurrencyStats): number {
  return (stats.busySlots * stats.slotMs) / 3_600_000
}

/**
 * Share of working time at each concurrency level, as `[level, share]` pairs.
 * The last level is inclusive (`MAX_LEVEL+`). Empty when nothing ran.
 */
export function concurrencyShares(stats: ConcurrencyStats): { level: number; share: number }[] {
  if (stats.busySlots === 0) return []
  const out: { level: number; share: number }[] = []
  for (let n = 1; n <= MAX_LEVEL; n++) {
    const slots = stats.histogram[n] ?? 0
    if (slots > 0) out.push({ level: n, share: slots / stats.busySlots })
  }
  return out
}
