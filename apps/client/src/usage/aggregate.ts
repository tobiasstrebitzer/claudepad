// @/usage - aggregate.ts
//
// Pure folds from the normalized schema into Usage Insights roll-ups (PRD-13
// FR-2/3). No I/O, no cost - reused by the worker and by tests alike.

import type { Session, SessionEvent, TokenUsage } from '@/schema'
import type {
  ByModel,
  FileAggregate,
  ProjectUsage,
  SessionUsage,
  UsageBucket,
  UsageRecord,
  VaultUsage
} from './types'

// Mirrors the playback DEFAULT_PACING.idleThreshold (PRD-13 OQ-10): an
// inter-event gap longer than this counts as idle and is excluded from active
// wall-clock; shorter gaps count in full.
const IDLE_THRESHOLD_MS = 20_000

const UNKNOWN_MODEL = '(unknown)'
const UNKNOWN_PROJECT = '(unknown)'

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
}

/** Total billable-ish tokens across every kind (used for shares/sorting). */
export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheCreate + u.cacheRead
}

/** Accumulate `src` into `target` in place. Optional fields stay optional. */
export function addInto(target: TokenUsage, src: TokenUsage): TokenUsage {
  target.input += src.input
  target.output += src.output
  target.cacheCreate += src.cacheCreate
  target.cacheRead += src.cacheRead
  if (src.cacheCreate1h !== undefined)
    target.cacheCreate1h = (target.cacheCreate1h ?? 0) + src.cacheCreate1h
  if (src.cacheCreate5m !== undefined)
    target.cacheCreate5m = (target.cacheCreate5m ?? 0) + src.cacheCreate5m
  if (src.webSearch !== undefined) target.webSearch = (target.webSearch ?? 0) + src.webSearch
  if (src.webFetch !== undefined) target.webFetch = (target.webFetch ?? 0) + src.webFetch
  return target
}

function addByModel(into: ByModel, model: string, src: TokenUsage): void {
  const cur = into[model] ?? (into[model] = emptyUsage())
  addInto(cur, src)
}

function emptyBucket(): UsageBucket {
  return { totals: emptyUsage(), byModel: {} }
}

function modelOf(e: SessionEvent, fallback: string | undefined): string {
  if (e.kind === 'assistant' && typeof e.model === 'string') return e.model
  return fallback ?? UNKNOWN_MODEL
}

function epoch(ts: string | undefined): number | undefined {
  if (!ts) return undefined
  const t = Date.parse(ts)
  return Number.isFinite(t) ? t : undefined
}

/** Idle-collapsed active wall-clock (ms) over a chronological event stream. */
function activeMsOf(events: readonly SessionEvent[]): number {
  let active = 0
  let prev: number | undefined
  for (const e of events) {
    const t = epoch(e.ts)
    if (t === undefined) continue
    if (prev !== undefined) {
      const gap = t - prev
      if (gap > 0 && gap <= IDLE_THRESHOLD_MS) active += gap
    }
    prev = t
  }
  return active
}

/** Fold one session's events into a SessionUsage (FR-2). */
export function aggregateSession(session: Session): SessionUsage {
  const totals = emptyUsage()
  const byModel: ByModel = {}
  let messages = 0
  let firstAt: number | undefined
  let lastAt: number | undefined

  for (const e of session.events) {
    const t = epoch(e.ts)
    if (t !== undefined) {
      if (firstAt === undefined || t < firstAt) firstAt = t
      if (lastAt === undefined || t > lastAt) lastAt = t
    }
    if (!e.usage) continue
    messages += 1
    addInto(totals, e.usage)
    addByModel(byModel, modelOf(e, session.meta.model), e.usage)
  }

  const out: SessionUsage = {
    sessionId: session.id,
    totals,
    byModel,
    messages,
    activeMs: activeMsOf(session.events)
  }
  if (session.meta.title) out.title = session.meta.title
  if (session.meta.cwd) out.cwd = session.meta.cwd
  const model = dominantModel(session.meta.model, byModel)
  if (model) out.model = model
  if (firstAt !== undefined) out.firstAt = new Date(firstAt).toISOString()
  if (lastAt !== undefined) out.lastAt = new Date(lastAt).toISOString()
  return out
}

/** Dominant model: declared session model, else the most-tokens model. */
function dominantModel(declared: string | undefined, byModel: ByModel): string | undefined {
  if (declared) return declared
  let best: string | undefined
  let bestTokens = -1
  for (const [m, u] of Object.entries(byModel)) {
    const tok = totalTokens(u)
    if (tok > bestTokens) {
      bestTokens = tok
      best = m
    }
  }
  return best
}

function localDayKey(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function emptyWeekdayHour(): number[][] {
  return Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
}

/**
 * Per-file aggregate (FR-16): the session's own usage plus the flat list of its
 * usage-bearing turns (each with a cross-file dedup key, local day/hour, model,
 * and tokens), with no reference to the raw session - cacheable and re-rollable
 * under any project/day-range filter. Bucketing and dedup happen at roll-up
 * time, because a turn copied into a resumed file must be dropped once across the
 * *whole* vault before it's summed (a pre-summed day bucket can't be deduped).
 */
export function aggregateFile(session: Session): FileAggregate {
  const usage = aggregateSession(session)
  const records: UsageRecord[] = []

  for (const e of session.events) {
    if (!e.usage) continue
    const t = epoch(e.ts)
    if (t === undefined) continue
    const rec: UsageRecord = {
      day: localDayKey(t),
      hour: new Date(t).getHours(),
      model: modelOf(e, session.meta.model),
      usage: e.usage
    }
    if (e.usageKey !== undefined) rec.key = e.usageKey
    records.push(rec)
  }

  const out: FileAggregate = { usage, records }
  if (usage.cwd) out.cwd = usage.cwd
  return out
}

function emptyProject(project: string): ProjectUsage {
  return { project, totals: emptyUsage(), byModel: {}, sessions: 0, activeMs: 0 }
}

export interface DayRange {
  /** Inclusive `YYYY-MM-DD` bounds; omit a bound to leave it open. */
  fromDay?: string
  toDay?: string
}

function dayInRange(day: string, range?: DayRange): boolean {
  if (!range) return true
  if (range.fromDay && day < range.fromDay) return false
  if (range.toDay && day > range.toDay) return false
  return true
}

/** Weekday 0..6 (Sun..Sat) for a `YYYY-MM-DD` key, in local time. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay()
}

/**
 * Roll per-file aggregates into a VaultUsage (FR-3/16), optionally clipped to a
 * day range. Turns copied into resumed/sidechain session files are **deduplicated
 * across the whole vault** by their `key` (first occurrence wins) before any
 * summing - without this, a turn written to N files is counted N times, which on
 * a real vault more than doubles the token and cost figures. Every figure -
 * global/project totals, per-day trend, per-project month buckets (Real Spend),
 * weekday/hour heatmap, and per-session totals for the histogram - is summed from
 * the deduped, in-range turns, so a start/end down to the day yields exact usage.
 * Pure merge: the expensive parse is already cached per file, so this re-runs
 * instantly on filter changes.
 */
export function rollupVault(files: readonly FileAggregate[], range?: DayRange): VaultUsage {
  const global = emptyProject('(global)')
  const projects = new Map<string, ProjectUsage>()
  const sessions: SessionUsage[] = []
  const byDay: Record<string, UsageBucket> = {}
  const byProjectMonth: Record<string, Record<string, UsageBucket>> = {}
  const byModel: ByModel = {}
  const byWeekdayHour = emptyWeekdayHour()
  // Cross-file dedup: a turn whose key was already counted (in any prior file) is
  // skipped. Keyless turns (no message.id) are always kept - they can't be a copy.
  const seen = new Set<string>()

  for (const f of files) {
    const key = f.cwd ?? UNKNOWN_PROJECT
    const proj = projects.get(key) ?? emptyProject(key)
    const months = (byProjectMonth[key] ??= {})

    // Per-session totals restricted to the range (for the histogram + count).
    const sessionTotals = emptyUsage()
    const sessionByModel: ByModel = {}
    let included = false

    for (const r of f.records) {
      if (r.key !== undefined) {
        if (seen.has(r.key)) continue
        seen.add(r.key)
      }
      if (!dayInRange(r.day, range)) continue
      included = true

      addInto(global.totals, r.usage)
      addInto(proj.totals, r.usage)
      addInto(sessionTotals, r.usage)
      addByModel(byModel, r.model, r.usage)
      addByModel(global.byModel, r.model, r.usage)
      addByModel(proj.byModel, r.model, r.usage)
      addByModel(sessionByModel, r.model, r.usage)

      const bucket = (byDay[r.day] ??= emptyBucket())
      addInto(bucket.totals, r.usage)
      addByModel(bucket.byModel, r.model, r.usage)

      const month = (months[r.day.slice(0, 7)] ??= emptyBucket())
      addInto(month.totals, r.usage)
      addByModel(month.byModel, r.model, r.usage)

      byWeekdayHour[weekdayOf(r.day)]![r.hour]! += 1
    }

    if (!included) continue
    proj.sessions += 1
    global.sessions += 1
    proj.activeMs += f.usage.activeMs
    global.activeMs += f.usage.activeMs
    if (f.usage.firstAt) {
      if (!proj.firstAt || f.usage.firstAt < proj.firstAt) proj.firstAt = f.usage.firstAt
    }
    if (f.usage.lastAt) {
      if (!proj.lastAt || f.usage.lastAt > proj.lastAt) proj.lastAt = f.usage.lastAt
    }
    projects.set(key, proj)
    sessions.push({
      ...f.usage,
      totals: sessionTotals,
      byModel: sessionByModel
    })
  }

  return {
    global,
    projects: [...projects.values()].sort((a, b) => totalTokens(b.totals) - totalTokens(a.totals)),
    sessions,
    byDay,
    byProjectMonth,
    byWeekdayHour,
    byModel
  }
}

/**
 * Convenience: roll raw sessions straight into a VaultUsage. The worker path
 * uses `aggregateFile` + `rollupVault` (so per-file aggregates can be cached);
 * this wrapper is for tests and small in-memory sets.
 */
export function aggregateVault(sessions: { session: Session }[], range?: DayRange): VaultUsage {
  return rollupVault(
    sessions.map((s) => aggregateFile(s.session)),
    range
  )
}
