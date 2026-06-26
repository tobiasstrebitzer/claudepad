// @/usage/scorecard - stats.ts
//
// The scorecard view-model: a pure fold of the dashboard view into the handful
// of numbers worth bragging about. Vanity (tokens, cost, sessions, projects) is
// grounded in "metrics that matter" - cache efficiency, average context size,
// and reset discipline - so the card rewards good habits, not just volume.

import type { DashboardView } from '../derive'

/** Sessions under this token line count as "lean" - kept focused, reset early. */
export const LEAN_SESSION_TOKENS = 1_000_000

export interface Scorecard {
  /** Vanity headline. */
  totalTokens: number
  /** Estimated, API-equivalent cost. null when no model in range is priced. */
  cost: number | null
  sessions: number
  projects: number
  activeDays: number
  topModel?: string
  /** cacheRead / total tokens (0..1) - the headline efficiency metric. */
  cacheRatio: number
  /** Avg prompt tokens per turn (input + cache) - a proxy for context size. */
  avgContextPerTurn: number
  /** Avg total tokens per session - smaller = more reset discipline. */
  avgSessionTokens: number
  /** Share of sessions kept under LEAN_SESSION_TOKENS (0..1). */
  leanShare: number
  /** A->E cache-efficiency grade derived from cacheRatio. */
  grade: string
}

function gradeFor(cacheRatio: number): string {
  if (cacheRatio >= 0.9) return 'A'
  if (cacheRatio >= 0.8) return 'B'
  if (cacheRatio >= 0.65) return 'C'
  if (cacheRatio >= 0.5) return 'D'
  return 'E'
}

export function buildScorecard(view: DashboardView): Scorecard {
  const t = view.totals
  const total = t.input + t.output + t.cacheCreate + t.cacheRead
  const turns = view.messageCount
  const sessions = view.sessionCount
  const leanCount = view.sessionTokens.filter((n) => n < LEAN_SESSION_TOKENS).length
  const cacheRatio = total > 0 ? t.cacheRead / total : 0

  return {
    totalTokens: total,
    cost: view.cost.unpriced ? null : view.cost.total,
    sessions,
    projects: view.projectCount,
    activeDays: view.activeDays,
    ...(view.topModel ? { topModel: view.topModel.model } : {}),
    cacheRatio,
    avgContextPerTurn: turns > 0 ? (t.input + t.cacheCreate + t.cacheRead) / turns : 0,
    avgSessionTokens: sessions > 0 ? total / sessions : 0,
    leanShare: sessions > 0 ? leanCount / sessions : 0,
    grade: gradeFor(cacheRatio)
  }
}
