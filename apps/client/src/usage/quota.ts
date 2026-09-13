// @/usage - quota.ts
//
// "How much of my subscription's rate limit did that cost?" - the question the
// dollar estimate cannot answer, because a Claude subscription does not meter
// what the API charges.
//
// Two facts drive everything here, both established by regressing measured
// `utilization` telemetry against real token spend (see quotaLog.ts and D-100):
//
//  1. Only fresh input + output + cache writes are metered. Cache reads are
//     free. For a heavy agentic user that is ~three quarters of the API-
//     equivalent cost, so quota burn and cost are very different numbers.
//  2. Limits are enforced over two tumbling windows - a 5-hour session window
//     anchored to your first use, and a fixed weekly window - plus, on some
//     plans, a per-model-family weekly sub-limit.
//
// The bundled limits are reverse-engineered from one Max 20x account, not
// published. They are offered as an estimate, are user-editable, and are
// replaced by exact values whenever quota telemetry is available.

import { dedupedRecords } from './aggregate'
import { costOf, meteredCost, type ModelRate } from './pricing'
import type { FileAggregate, UsageRecord } from './types'

export const SESSION_WINDOW_MS = 5 * 60 * 60_000
export const WEEK_MS = 7 * 24 * 60 * 60_000

/** Session windows start on a :00/:30 boundary, not at the exact first turn. */
const ANCHOR_MS = 30 * 60_000

/**
 * A plan's metered budgets, in USD of API-equivalent cost over the metered
 * token kinds. Dollars are a unit of account here, not a bill - they are just
 * the weighting that made the observed utilization linear.
 */
export interface QuotaPlan {
  id: string
  label: string
  /** Budget per 5-hour session window. */
  session: number
  /** Budget per weekly window. */
  weekly: number
  /** Optional weekly sub-limit scoped to one model family. */
  scoped?: { family: string; label: string; weekly: number }
  /** Weekly reset: UTC weekday (0=Sun) + hour the window rolls over. */
  weeklyResetDay: number
  weeklyResetHour: number
  /** How these numbers were arrived at, shown verbatim in the UI. */
  provenance: string
}

/**
 * Calibrated against one Max 20x account over 5 weeks of quota telemetry: 22
 * qualifying 5-hour windows (spread 20%), 2 weekly windows, 1 Fable window.
 *
 * These are in the units `costOf` produces, including its 1h/5m cache-write
 * split - swap the pricing table and the budgets move with it, which is why
 * calibration always re-derives them rather than trusting these. The data
 * cannot distinguish pricing 1h writes at 2x from pricing every write at the 5m
 * rate (window spread 19.8% vs 20.8%), so the split is kept only because it is
 * what the cost model already does.
 *
 * Not published by Anthropic. One account, five weeks: assume +/-20%, expect
 * drift, and prefer measured values whenever a quota log is available.
 */
export const MAX_20X: QuotaPlan = {
  id: 'max-20x',
  label: 'Max 20x',
  session: 75,
  weekly: 528,
  scoped: { family: 'fable', label: 'Fable', weekly: 118 },
  weeklyResetDay: 0,
  weeklyResetHour: 4,
  provenance:
    'Reverse-engineered from 5 weeks of one Max 20x account (22 session windows, 2 of them at exactly 100%). Anthropic publishes none of this - assume +/-20%, and import your own quota log to replace it with measured values.'
}

export const QUOTA_PLANS: Record<string, QuotaPlan> = { [MAX_20X.id]: MAX_20X }

/** Model family for the scoped sub-limit (`claude-fable-5-1` -> `fable`). */
export function modelFamily(model: string): string {
  const m = model.replace(/^claude-/, '')
  const dash = m.indexOf('-')
  return dash === -1 ? m : m.slice(0, dash)
}

export interface QuotaWindow {
  start: number
  end: number
  /** Metered spend in the window, USD. */
  metered: number
  /** Metered spend from the scoped family only. */
  scoped: number
  /** Full API-equivalent cost, for the contrast with what was metered. */
  apiCost: number
  turns: number
  /** 0..1+ of the plan budget. Can exceed 1 when the plan estimate is low. */
  utilization: number
  /** 0..1+ of the scoped budget, when the plan has one. */
  scopedUtilization?: number
}

interface Priced { ts: number; model: string; metered: number; api: number }

function price(records: readonly UsageRecord[], pricing?: Record<string, ModelRate>): Priced[] {
  return records.map((r) => {
    const c = costOf(r.usage, r.model, pricing)
    return { ts: r.ts, model: r.model, metered: meteredCost(c), api: c.total }
  })
}

/**
 * Priced, deduped turn stream in the shape the calibrator wants: metered spend
 * per turn, plus the slice attributable to the plan's scoped family.
 */
export function meteredSpend(
  files: readonly FileAggregate[],
  plan: QuotaPlan,
  pricing?: Record<string, ModelRate>
): { ts: number; metered: number; scoped: number }[] {
  return price(dedupedRecords(files), pricing).map((p) => ({
    ts: p.ts,
    metered: p.metered,
    scoped: modelFamily(p.model) === plan.scoped?.family ? p.metered : 0
  }))
}

function emptyWindow(start: number, end: number): QuotaWindow {
  return { start, end, metered: 0, scoped: 0, apiCost: 0, turns: 0, utilization: 0 }
}

function fill(w: QuotaWindow, plan: QuotaPlan): QuotaWindow {
  w.utilization = plan.session > 0 ? w.metered / plan.session : 0
  if (plan.scoped) w.scopedUtilization = w.scoped / plan.scoped.weekly
  return w
}

/**
 * Tumbling 5-hour session windows. A window opens on the first turn after the
 * previous one closed, with its start snapped **down** to a :00/:30 boundary -
 * the behaviour the observed `resets_at` values imply (a rejection at 04:18Z
 * reported a 04:30Z reset, i.e. a window that opened at 23:30Z).
 */
export function sessionWindows(
  records: readonly UsageRecord[],
  plan: QuotaPlan,
  pricing?: Record<string, ModelRate>
): QuotaWindow[] {
  const out: QuotaWindow[] = []
  for (const p of price(records, pricing)) {
    let cur = out.at(-1)
    if (!cur || p.ts >= cur.end) {
      const start = Math.floor(p.ts / ANCHOR_MS) * ANCHOR_MS
      cur = emptyWindow(start, start + SESSION_WINDOW_MS)
      out.push(cur)
    }
    cur.metered += p.metered
    cur.apiCost += p.api
    cur.turns += 1
    if (modelFamily(p.model) === plan.scoped?.family) cur.scoped += p.metered
  }
  return out.map((w) => fill(w, plan))
}

/** Start of the weekly window containing `t`, per the plan's reset boundary. */
export function weekStart(t: number, plan: QuotaPlan): number {
  const d = new Date(t)
  const anchor = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), plan.weeklyResetHour
  )
  const back = (d.getUTCDay() - plan.weeklyResetDay + 7) % 7
  let start = anchor - back * 24 * 60 * 60_000
  if (t < start) start -= WEEK_MS
  return start
}

/** Tumbling weekly windows on the plan's fixed reset boundary. */
export function weeklyWindows(
  records: readonly UsageRecord[],
  plan: QuotaPlan,
  pricing?: Record<string, ModelRate>
): QuotaWindow[] {
  const by = new Map<number, QuotaWindow>()
  for (const p of price(records, pricing)) {
    const s = weekStart(p.ts, plan)
    const w = by.get(s) ?? emptyWindow(s, s + WEEK_MS)
    w.metered += p.metered
    w.apiCost += p.api
    w.turns += 1
    if (modelFamily(p.model) === plan.scoped?.family) w.scoped += p.metered
    by.set(s, w)
  }
  return [...by.values()]
    .sort((a, b) => a.start - b.start)
    .map((w) => {
      const f = fill(w, plan)
      f.utilization = plan.weekly > 0 ? f.metered / plan.weekly : 0
      return f
    })
}

export interface WeekForecast {
  window: QuotaWindow
  /** 0..1 of the week elapsed at `now`. */
  elapsed: number
  /** Metered spend per day so far. */
  burnPerDay: number
  /** Projected end-of-week utilization if the current rate holds. */
  projected: number
  /** Projected utilization of the scoped sub-limit. */
  projectedScoped?: number
  /** When the budget runs out at the current rate; undefined if it does not. */
  exhaustsAt?: number
  /** Which limit binds first. */
  bindingLimit: 'weekly' | 'scoped' | 'none'
}

/**
 * Straight-line projection of the in-progress week. Deliberately naive: it
 * answers "if I keep going like this", which is the question worth asking on a
 * Thursday, not a behavioural model of the rest of the week.
 */
export function forecastWeek(
  windows: readonly QuotaWindow[],
  plan: QuotaPlan,
  now: number
): WeekForecast | undefined {
  const w = windows.find((x) => now >= x.start && now < x.end)
  if (!w) return undefined
  const elapsed = Math.min(1, Math.max(0, (now - w.start) / WEEK_MS))
  if (elapsed <= 0) return undefined

  const days = (now - w.start) / 86_400_000
  const projected = w.utilization / elapsed
  const scopedProjected = w.scopedUtilization !== undefined ? w.scopedUtilization / elapsed : undefined

  const rate = w.metered / (now - w.start) // $/ms
  const remaining = plan.weekly - w.metered
  let exhaustsAt = rate > 0 && remaining > 0 ? now + remaining / rate : undefined
  if (exhaustsAt !== undefined && exhaustsAt > w.end) exhaustsAt = undefined

  let binding: WeekForecast['bindingLimit'] = 'none'
  if (projected >= 1 || (scopedProjected ?? 0) >= 1) {
    binding = (scopedProjected ?? 0) > projected ? 'scoped' : 'weekly'
  }

  return {
    window: w,
    elapsed,
    burnPerDay: days > 0 ? w.metered / days : 0,
    projected,
    ...(scopedProjected !== undefined ? { projectedScoped: scopedProjected } : {}),
    ...(exhaustsAt !== undefined ? { exhaustsAt } : {}),
    bindingLimit: binding
  }
}

export interface QuotaView {
  plan: QuotaPlan
  /** Metered (quota-consuming) spend over the scoped range. */
  metered: number
  /** Full API-equivalent cost over the same range. */
  apiCost: number
  /** 0..1 of API cost that the meter ignores - cache reads. */
  freeShare: number
  sessions: QuotaWindow[]
  weeks: QuotaWindow[]
  /** Session windows that reached the budget. */
  sessionsMaxed: number
  /** Highest session-window utilization seen. */
  peakSession: number
  forecast?: WeekForecast
  /** True when limits came from measured telemetry instead of the bundled plan. */
  calibrated: boolean
}

export function buildQuota(
  files: readonly FileAggregate[],
  plan: QuotaPlan,
  now: number,
  pricing?: Record<string, ModelRate>,
  calibrated = false
): QuotaView {
  const records = dedupedRecords(files)
  const sessions = sessionWindows(records, plan, pricing)
  const weeks = weeklyWindows(records, plan, pricing)
  const metered = sessions.reduce((n, w) => n + w.metered, 0)
  const apiCost = sessions.reduce((n, w) => n + w.apiCost, 0)
  const forecast = forecastWeek(weeks, plan, now)
  return {
    plan,
    metered,
    apiCost,
    freeShare: apiCost > 0 ? 1 - metered / apiCost : 0,
    sessions,
    weeks,
    sessionsMaxed: sessions.filter((w) => w.utilization >= 1).length,
    peakSession: sessions.reduce((n, w) => Math.max(n, w.utilization), 0),
    ...(forecast ? { forecast } : {}),
    calibrated
  }
}
