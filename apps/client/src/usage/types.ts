// @/usage - types.ts
//
// Aggregate shapes for Usage Insights (PRD-13). The per-turn `TokenUsage` lives
// in the schema; these roll it up per session / project / vault. Pure data - no
// I/O, no cost (cost is layered on in pricing.ts).

import type { RateLimitHit, TokenUsage } from '@/schema'

export type { RateLimitHit, TokenUsage }

/**
 * What a delegated subagent run is, as the roll-up sees it. Claude Code stores
 * these beside the parent session (`<project>/<sessionId>/subagents/agent-*.jsonl`)
 * with a tiny `.meta.json` sidecar naming the agent type; they are real spend and
 * real work, so they must be counted - but never as top-level *sessions*, or the
 * session count and the parallelism metric both stop meaning anything.
 */
export interface AgentRunInfo {
  /** File stem, e.g. `agent-acdb9b4a0514233d2`. */
  agentId: string
  /** The main session this run was delegated from. */
  parentSessionId: string
  /** Declared subagent type (`Explore`, `fable`, `general-purpose`, ...). */
  agentType?: string
  /** Short human description of the delegated task, when the sidecar has one. */
  description?: string
  /** 1 = spawned by the main session; 2+ = spawned by another subagent. */
  spawnDepth?: number
}

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
  /** Top-level sessions only - delegated runs are counted in `agentRuns`. */
  sessions: number
  /** Delegated subagent runs that contributed usage in range. */
  agentRuns: number
  /** The delegated slice of `totals` (subset, not an addition). */
  delegated: TokenUsage
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
  /**
   * Epoch ms of the turn. `day`/`hour` are the pre-bucketed local-calendar keys
   * (kept so roll-up stays a cheap merge); `ts` is the raw instant, needed by
   * anything sub-hourly - concurrency slots, 5h limit windows.
   */
  ts: number
  model: string
  /**
   * Set iff this turn ran inside a delegated subagent run; the value is the
   * agent type. Presence - not the value - is what marks a turn as delegated.
   */
  agentType?: string
  usage: TokenUsage
}

/** A rate-limit rejection, placed on the timeline. */
export interface LimitEvent extends RateLimitHit {
  /** Epoch ms the rejection was recorded. */
  ts: number
  /** Local-calendar day `YYYY-MM-DD`. */
  day: string
  /** Project (`cwd`) the rejection happened in. */
  project?: string
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
  /** Present iff this file is a delegated subagent run, not a top-level session. */
  agent?: AgentRunInfo
  /** Rate-limit rejections recorded in this file (usually none). */
  limits?: LimitEvent[]
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
  /**
   * Per-subagent-type totals. Covers delegated turns only, so its sum is
   * `delegated`, not `global.totals`.
   */
  byAgentType: Record<string, UsageBucket>
  /** The delegated (subagent) slice of `global.totals` - a subset, not an addition. */
  delegated: TokenUsage
  /** Delegated subagent runs that contributed usage in range. */
  agentRuns: number
  /** Rate-limit rejections in range, chronological. */
  limits: LimitEvent[]
  /** How many top-level sessions were in flight at once, over time. */
  concurrency: ConcurrencyStats
  /** ISO timestamp this roll-up was computed (stamped by the caller). */
  computedAt?: string
}

/**
 * Time-weighted parallelism: how many top-level sessions were actually running
 * at the same time. Computed by slicing the range into fixed slots and counting
 * distinct sessions with a turn in (or spanning) each slot, so it measures real
 * overlap rather than "sessions that share a calendar day".
 */
export interface ConcurrencyStats {
  /** Slot width in ms (the resolution every figure below is quantized to). */
  slotMs: number
  /** Slots with at least one session running - i.e. time actually spent working. */
  busySlots: number
  /** Mean concurrent sessions across busy slots (1 = always strictly serial). */
  mean: number
  /** Highest simultaneous session count observed. */
  max: number
  /**
   * Busy-slot counts by concurrency level: `histogram[n]` slots had exactly `n`
   * sessions running. Index 0 is unused; the last index is a `n+` bucket.
   */
  histogram: number[]
  /** Peak simultaneous *delegated* runs (agent fan-out), same slotting. */
  maxAgents: number
}
