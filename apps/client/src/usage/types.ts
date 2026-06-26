// @/usage - types.ts
//
// Aggregate shapes for Usage Insights (PRD-13). The per-turn `TokenUsage` lives
// in the schema; these roll it up per session / project / vault. Pure data - no
// I/O, no cost (cost is layered on in pricing.ts).

import type { TokenUsage } from '@/schema'

export type { TokenUsage }

/** Per-model token totals within a session/project. */
export type ByModel = Record<string, TokenUsage>

/**
 * A time/project bucket that keeps both the summed totals and the per-model
 * split, so cost (which is model- and token-kind-dependent) can be computed at
 * view time against the current pricing table.
 */
export interface UsageBucket {
  totals: TokenUsage
  byModel: ByModel
}

export interface SessionUsage {
  sessionId: string
  title?: string
  cwd?: string
  /** Dominant assistant model for the session. */
  model?: string
  /** Summed over every usage-bearing assistant turn. */
  totals: TokenUsage
  byModel: ByModel
  /** Count of assistant turns that carried usage. */
  messages: number
  firstAt?: string
  lastAt?: string
  /** Idle-collapsed wall-clock across the session, in ms. */
  activeMs: number
}

export interface ProjectUsage {
  /** Project key = `cwd` (or "(unknown)" when absent). */
  project: string
  totals: TokenUsage
  byModel: ByModel
  sessions: number
  firstAt?: string
  lastAt?: string
  activeMs: number
}

/**
 * One usage-bearing assistant turn, reduced to what the roll-up needs: its local
 * day/hour (for trend + heatmap bucketing), model (for cost), token usage, and a
 * cross-file dedup `key`. The roll-up - not the per-file aggregate - does the
 * day/month/weekday bucketing, because Claude Code copies the same turn into
 * resumed/sidechain files and those copies must be dropped (by `key`) *before*
 * summing. A pre-summed bucket can't be deduped after the fact, so the atom that
 * gets cached per file is the record, not the day.
 */
export interface UsageRecord {
  /** `message.id[:requestId]`; absent -> the turn is never deduped (counted as-is). */
  key?: string
  /** Local-calendar day `YYYY-MM-DD`. */
  day: string
  /** Local hour 0..23 (for the weekday x hour heatmap). */
  hour: number
  model: string
  usage: TokenUsage
}

/**
 * Everything one session file contributes to the vault roll-up, with NO
 * reference to the raw session - so it can be cached per file and re-rolled
 * (under any project/day-range filter) without reparsing (PRD-13 FR-16). The
 * cache key is `(fileId, size, lastModified)`. Day/month/weekday views are
 * derived from `records` at roll-up time (after cross-file dedup), so they're
 * never stored here.
 */
export interface FileAggregate {
  usage: SessionUsage
  cwd?: string
  records: UsageRecord[]
}

export interface VaultUsage {
  global: ProjectUsage
  projects: ProjectUsage[]
  /** Per-session roll-ups (feeds the tokens-per-session histogram + drill-in). */
  sessions: SessionUsage[]
  /** Usage keyed by local-calendar day `YYYY-MM-DD` (totals + model split). */
  byDay: Record<string, UsageBucket>
  /** Per-project, per-local-month (`YYYY-MM`) usage - feeds Real Spend. */
  byProjectMonth: Record<string, Record<string, UsageBucket>>
  /** [weekday 0=Sun..6][hour 0..23] activity, by usage-bearing message count. */
  byWeekdayHour: number[][]
  /** Per-model totals across the whole vault. */
  byModel: ByModel
  /** ISO timestamp this roll-up was computed (stamped by the caller). */
  computedAt?: string
}
