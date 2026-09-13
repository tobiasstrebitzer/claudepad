// @/usage - quotaLog.ts
//
// Exact quota readings, when the user happens to have them.
//
// Claude Code never writes remaining quota to a transcript, so claudepad can
// only ever *estimate* limit consumption from tokens. But the Claude desktop
// app does poll a usage endpoint, and tools like `ccstatusbar` archive those
// responses as JSONL under Application Support. If the user points us at that
// log we get the real thing: a `utilization` percentage per limit, sampled
// every few minutes.
//
// Two uses. Display the measured percentage instead of our estimate, and -
// better - *calibrate*: pair each window's peak utilization with the metered
// spend we computed for the same window, and the plan's true budget falls out
// as spend / utilization. That turns a bundled guess into this account's
// actual limits.
//
// Tolerant by construction: the log is a third-party artifact whose shape we do
// not control, so unknown fields are ignored and a malformed line is skipped
// rather than failing the import.

import type { QuotaPlan, QuotaWindow } from './quota'
import { SESSION_WINDOW_MS } from './quota'

/** One polled reading of the account's limits. */
export interface QuotaSample {
  /** When the reading was taken. */
  ts: number
  /** 0..100 of the 5-hour session limit. */
  session?: number
  /** Epoch ms the session window resets. */
  sessionResetsAt?: number
  /** 0..100 of the weekly limit. */
  weekly?: number
  weeklyResetsAt?: number
  /** 0..100 of the model-scoped weekly sub-limit. */
  scoped?: number
  scopedResetsAt?: number
  /** Display name the source gave the scoped limit, e.g. `Fable`. */
  scopedLabel?: string
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function time(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : undefined
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/**
 * Parse a ccstatusbar-style usage log. Lines without a `raw` payload (bare
 * heartbeats) carry no reading and are skipped.
 */
export function parseQuotaLog(text: string): QuotaSample[] {
  const out: QuotaSample[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let rec: unknown
    try { rec = JSON.parse(line) } catch { continue }
    const r = obj(rec)
    if (!r) continue
    const raw = obj(r['raw'])
    if (!raw) continue
    const ts = time(r['t'])
    if (ts === undefined) continue

    const s: QuotaSample = { ts }
    const fh = obj(raw['five_hour'])
    if (fh) {
      s.session = num(fh['utilization'])
      s.sessionResetsAt = time(fh['resets_at'])
    }
    const sd = obj(raw['seven_day'])
    if (sd) {
      s.weekly = num(sd['utilization'])
      s.weeklyResetsAt = time(sd['resets_at'])
    }
    // The scoped weekly limit is only described inside `limits[]`.
    const limits = raw['limits']
    if (Array.isArray(limits)) {
      for (const entry of limits) {
        const l = obj(entry)
        if (l?.['kind'] !== 'weekly_scoped') continue
        s.scoped = num(l['percent'])
        s.scopedResetsAt = time(l['resets_at'])
        const model = obj(obj(l['scope'])?.['model'])
        const name = model?.['display_name']
        if (typeof name === 'string') s.scopedLabel = name
      }
    }
    out.push(s)
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

/**
 * How much of a window's utilization rise may go unexplained by local
 * transcripts before the window is dropped from calibration. Some slack is
 * needed: utilization is reported in whole percent and lags the turn that
 * caused it, so an isolated tick can land in an interval with no local spend.
 */
const MAX_UNEXPLAINED = 0.25

type Field = 'session' | 'weekly' | 'scoped'
const RESET_OF: Record<Field, keyof QuotaSample> = {
  session: 'sessionResetsAt',
  weekly: 'weeklyResetsAt',
  scoped: 'scopedResetsAt'
}

/**
 * Group readings by the window they describe and drop non-monotone samples.
 *
 * Utilization only ever rises inside a window, so a reading below the running
 * maximum is a failed poll, not a refund. Real logs contain runs of these -
 * one observed account logged a full day of spurious zeros - and taking them at
 * face value silently halves that window's peak and doubles the limit inferred
 * from it.
 */
export function windowsOf(samples: readonly QuotaSample[], field: Field): Map<number, QuotaSample[]> {
  const resetKey = RESET_OF[field]
  const groups = new Map<number, QuotaSample[]>()
  for (const s of samples) {
    const util = s[field]
    const reset = s[resetKey]
    if (typeof util !== 'number' || typeof reset !== 'number') continue
    const key = Math.round(reset / 60_000) * 60_000
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  for (const [key, list] of groups) {
    list.sort((a, b) => a.ts - b.ts)
    let peak = -1
    groups.set(key, list.filter((s) => {
      const v = s[field]!
      if (v < peak) return false
      peak = v
      return true
    }))
  }
  return groups
}

export interface CalibrationPoint {
  start: number
  end: number
  /** Peak utilization observed, 0..100. */
  peak: number
  /** Metered spend up to the peak reading. */
  metered: number
  /** Implied full budget: metered / peak * 100. */
  implied: number
}

export interface Calibration {
  session?: number
  weekly?: number
  scoped?: number
  /** Windows rejected because the loaded transcripts did not explain them. */
  unexplainedWindows: number
  points: { session: CalibrationPoint[]; weekly: CalibrationPoint[]; scoped: CalibrationPoint[] }
  /** Samples in the log, and how many survived the monotone filter. */
  samples: number
  span?: { from: number; to: number }
}

/** Median, or undefined for an empty list. */
function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Share of a window's utilization rise that the local transcripts cannot
 * account for, 0..1.
 *
 * Calibration divides measured spend by measured utilization, so it is only
 * valid when the transcripts explain the whole window. They may not: the user
 * dropped in a handful of files rather than connecting the vault, retention
 * pruned older sessions, or the work happened on another machine. In every case
 * the numerator is short while the denominator is complete, and the budget
 * comes out far too low - one partial import implied a $18 five-hour budget
 * against a true ~$75.
 */
function unexplainedRise(
  list: readonly QuotaSample[],
  field: Field,
  spend: readonly { ts: number; metered: number; scoped: number }[],
  until: number,
  scopedOnly: boolean
): number {
  let rise = 0
  let unexplained = 0
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]!
    const b = list[i]!
    if (b.ts > until) break
    const step = (b[field]!) - (a[field]!)
    if (step <= 0) continue
    rise += step
    let local = 0
    for (const p of spend) {
      if (p.ts <= a.ts) continue
      if (p.ts > b.ts) break
      local += scopedOnly ? p.scoped : p.metered
    }
    if (local <= 0) unexplained += step
  }
  return rise > 0 ? unexplained / rise : 0
}

/** Largest observation gap between `start` and `until`, over surviving samples. */
function maxGap(list: readonly QuotaSample[], start: number, until: number): number {
  let worst = 0
  let prev = start
  for (const s of list) {
    if (s.ts > until) break
    worst = Math.max(worst, s.ts - prev)
    prev = s.ts
  }
  return Math.max(worst, until - prev)
}

/** Cumulative metered spend in `[start, until]`, from already-priced windows. */
function meteredUpTo(
  spend: readonly { ts: number; metered: number; scoped: number }[],
  start: number,
  until: number,
  scopedOnly: boolean
): number {
  let n = 0
  for (const p of spend) {
    if (p.ts < start) continue
    if (p.ts > until) break
    n += scopedOnly ? p.scoped : p.metered
  }
  return n
}

export interface CalibrateInput {
  /** Priced, deduped turns in chronological order. */
  spend: readonly { ts: number; metered: number; scoped: number }[]
  samples: readonly QuotaSample[]
  /** Window length for the weekly limits, from the plan. */
  weekMs: number
}

/**
 * Recover this account's real budgets by pairing each window's peak utilization
 * with the metered spend we measured over the same window.
 *
 * Quality gates matter more than sample count. A window is only usable when the
 * log covers it from (near) the start at (near) zero - otherwise spend that
 * happened before the log was running is missing from the numerator - and when
 * the peak is high enough that extrapolating to 100% is not amplifying noise.
 * The median across qualifying windows is the estimate; a single window is
 * reported but should be treated as provisional.
 */
export function calibrate(input: CalibrateInput): Calibration {
  const { spend, samples, weekMs } = input
  const out: Calibration = {
    points: { session: [], weekly: [], scoped: [] },
    unexplainedWindows: 0,
    samples: samples.length,
    ...(samples.length > 0
      ? { span: { from: samples[0]!.ts, to: samples[samples.length - 1]!.ts } }
      : {})
  }

  const specs: { field: Field; len: number; minPeak: number; maxGap: number; scopedOnly: boolean }[] = [
    { field: 'session', len: SESSION_WINDOW_MS, minPeak: 40, maxGap: 45 * 60_000, scopedOnly: false },
    { field: 'weekly', len: weekMs, minPeak: 25, maxGap: 8 * 3_600_000, scopedOnly: false },
    { field: 'scoped', len: weekMs, minPeak: 25, maxGap: 8 * 3_600_000, scopedOnly: true }
  ]

  for (const spec of specs) {
    for (const [reset, list] of windowsOf(samples, spec.field)) {
      if (list.length < 8) continue
      const end = reset
      const start = end - spec.len
      const first = list[0]!
      // The log must have been running from the top of the window, at ~zero.
      if (first.ts - start > Math.max(20 * 60_000, spec.len * 0.03)) continue
      if ((first[spec.field]!) > 3) continue

      let peakSample = list[0]!
      for (const s of list) if ((s[spec.field]!) >= (peakSample[spec.field]!)) peakSample = s
      const peak = peakSample[spec.field]!
      if (peak < spec.minPeak) continue

      // A long blind spot before the peak means usage may have happened
      // unobserved, so the peak understates the window and the implied budget
      // comes out too high. One real log went dark for a full day and inflated
      // that week's estimate by ~60%.
      if (maxGap(list, start, peakSample.ts) > spec.maxGap) continue

      // Reject a window the loaded transcripts cannot explain, rather than
      // dividing a partial numerator by a complete denominator.
      if (unexplainedRise(list, spec.field, spend, peakSample.ts, spec.scopedOnly) > MAX_UNEXPLAINED) {
        out.unexplainedWindows += 1
        continue
      }

      const metered = meteredUpTo(spend, start, peakSample.ts, spec.scopedOnly)
      if (metered <= 0) continue
      out.points[spec.field].push({ start, end, peak, metered, implied: (metered / peak) * 100 })
    }
  }

  out.session = median(out.points.session.map((p) => p.implied))
  out.weekly = median(out.points.weekly.map((p) => p.implied))
  out.scoped = median(out.points.scoped.map((p) => p.implied))
  return out
}

/** Apply a calibration over a plan, keeping any budget it could not measure. */
export function calibratedPlan(plan: QuotaPlan, cal: Calibration): QuotaPlan {
  const next: QuotaPlan = {
    ...plan,
    id: `${plan.id}-measured`,
    label: `${plan.label} (measured)`,
    session: cal.session ?? plan.session,
    weekly: cal.weekly ?? plan.weekly,
    provenance: `Measured from ${cal.points.session.length} session and ${cal.points.weekly.length} weekly windows in your own quota log.`
  }
  if (plan.scoped && cal.scoped !== undefined) {
    next.scoped = { ...plan.scoped, weekly: cal.scoped }
  }
  return next
}

/**
 * Latest measured reading at or before `now`, for showing the real percentage
 * next to (or instead of) the estimate.
 */
export function latestSample(samples: readonly QuotaSample[], now: number): QuotaSample | undefined {
  let best: QuotaSample | undefined
  for (const s of samples) {
    if (s.ts > now) break
    best = s
  }
  return best
}

/** Observed peak utilization per window, for charting measured history. */
export function observedPeaks(samples: readonly QuotaSample[], field: Field): QuotaWindow[] {
  const out: QuotaWindow[] = []
  for (const [reset, list] of windowsOf(samples, field)) {
    if (list.length === 0) continue
    const peak = Math.max(...list.map((s) => s[field]!))
    out.push({
      start: list[0]!.ts,
      end: reset,
      metered: 0,
      scoped: 0,
      apiCost: 0,
      turns: list.length,
      utilization: peak / 100
    })
  }
  return out.sort((a, b) => a.start - b.start)
}
