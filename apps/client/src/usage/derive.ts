// @/usage - derive.ts
//
// Pure view-model for the dashboard: rolls FileAggregates under the active
// project/date filters and layers cost, Real Spend, and effort on top. Keeps the
// chart components dumb and the whole transform unit-testable. Re-rolling is a
// cheap merge, so filter changes recompute instantly off the cached aggregates.

import { rollupVault, totalTokens, type DayRange } from './aggregate'
import { attributeSpend, type SpendWeight } from './attribution'
import { busyHours, concurrencyShares } from './concurrency'
import { effortHours, type EffortConfig } from './effort'
import { costOf, costOfByModel, type CostBreakdown, type ModelRate } from './pricing'
import type {
  ConcurrencyStats,
  FileAggregate,
  LimitEvent,
  ProjectUsage,
  SessionUsage,
  TokenUsage
} from './types'

export interface UsageSettings {
  /** Subscription charged per month, USD. 0 = Real Spend disabled. */
  monthlySubscription: number
  spendWeight: SpendWeight
  effort: EffortConfig
  pricing?: Record<string, ModelRate>
  /** Rate-limit budgets: which plan, and any hand-edited overrides. */
  quota?: QuotaSettings
}

export interface QuotaSettings {
  /** Key into QUOTA_PLANS; undefined = the bundled default. */
  planId?: string
  /** Hand-edited budgets, USD of metered spend. Each overrides the plan. */
  session?: number
  weekly?: number
  scoped?: number
  /** Prefer budgets measured from an imported quota log over the bundled ones. */
  useMeasured?: boolean
}

export interface UsageFilters {
  /** Selected project `cwd`; undefined = global (all projects). */
  project?: string
  /** Inclusive `YYYY-MM-DD` day range; every card/chart reflects it exactly. */
  fromDay?: string
  toDay?: string
}

export interface ProjectRow {
  project: string
  totals: TokenUsage
  tokens: number
  cost: number
  unpriced: boolean
  realSpend: number
  sessions: number
  lastAt?: string
}

export interface DayPoint {
  day: string
  totals: TokenUsage
  cost: number
}

export interface ModelRow {
  model: string
  tokens: number
  cost: number
  unpriced: boolean
}

/** One subagent type's slice of delegated work. */
export interface AgentTypeRow {
  agentType: string
  tokens: number
  cost: number
  unpriced: boolean
}

/** How much of the work was handed to subagents (PRD-13 FR-17). */
export interface DelegationView {
  /** Delegated tokens - a subset of `totals`, not an addition to it. */
  tokens: number
  /** 0..1 of all tokens that ran inside a subagent. */
  share: number
  /** Estimated API-equivalent cost of the delegated slice. */
  cost: number
  /** Delegated runs that contributed usage in range. */
  runs: number
  /** Runs per top-level session - the fan-out factor. */
  runsPerSession: number
  /** Peak simultaneous delegated runs. */
  peakParallel: number
  types: AgentTypeRow[]
}

/** Time-weighted "how many sessions at once" (PRD-13 FR-18). */
export interface ParallelismView extends ConcurrencyStats {
  /** Wall-clock with at least one session running, in hours. */
  busyHours: number
  /** Share of working time at each concurrency level (last is `n+`). */
  shares: { level: number; share: number }[]
  /** Share of working time with exactly one session running. */
  soloShare: number
}

/** Rate-limit rejections in range (PRD-13 FR-19). */
export interface LimitsView {
  events: LimitEvent[]
  /** Rejections grouped by source limit bucket (`five_hour`, `weekly`, ...). */
  byType: Record<string, number>
  /**
   * Distinct incidents: rejections sharing a reset time are one wall, even
   * though every in-flight session and subagent records its own rejection.
   */
  incidents: number
  /** Days in range on which at least one rejection happened. */
  daysHit: number
}

export interface DashboardView {
  totals: TokenUsage
  cost: CostBreakdown
  sessionCount: number
  projectCount: number
  activeDays: number
  /** Usage-bearing turns summed across the scoped sessions (for per-turn averages). */
  messageCount: number
  topModel?: { model: string; tokenShare: number }
  effortHours: number
  unpricedModels: string[]
  projects: ProjectRow[]
  series: DayPoint[]
  heat: number[][]
  /** Tokens-per-session totals (raw), for the histogram. */
  sessionTokens: number[]
  models: ModelRow[]
  delegation: DelegationView
  parallelism: ParallelismView
  limits: LimitsView
  /** Total subscription dollars allocated across the active months. */
  realSpendTotal: number
  activeMonths: string[]
}

function filesForProject(files: readonly FileAggregate[], project?: string): FileAggregate[] {
  if (!project) return [...files]
  return files.filter((f) => (f.cwd ?? '(unknown)') === project)
}

function rangeOf(filters: UsageFilters): DayRange | undefined {
  if (!filters.fromDay && !filters.toDay) return undefined
  const r: DayRange = {}
  if (filters.fromDay) r.fromDay = filters.fromDay
  if (filters.toDay) r.toDay = filters.toDay
  return r
}

function topModelOf(byModel: Record<string, TokenUsage>): { model: string; tokenShare: number } | undefined {
  const entries = Object.entries(byModel)
  if (entries.length === 0) return undefined
  const total = entries.reduce((n, [, u]) => n + totalTokens(u), 0)
  if (total === 0) return undefined
  let best = entries[0]!
  for (const e of entries) if (totalTokens(e[1]) > totalTokens(best[1])) best = e
  return { model: best[0], tokenShare: totalTokens(best[1]) / total }
}

/**
 * Build the dashboard view (FR-9..14, 7, 8). The day range and the project
 * filter are both pushed into the roll-up, so every card, chart, heatmap, and
 * the Real Spend allocation reflect the exact window down to the day. The
 * project table is rolled from the full (all-project) set within the same day
 * range, so the column stays comparable across projects.
 */
export function buildDashboard(
  files: readonly FileAggregate[],
  settings: UsageSettings,
  filters: UsageFilters = {}
): DashboardView {
  const pricing = settings.pricing
  const range = rangeOf(filters)

  // Scoped roll-up (project + day range) drives the cards and charts.
  const scoped = rollupVault(filesForProject(files, filters.project), range)
  const cost = costOfByModel(scoped.global.byModel, pricing)
  const series = Object.keys(scoped.byDay)
    .sort()
    .map((day) => {
      const bucket = scoped.byDay[day]!
      return { day, totals: bucket.totals, cost: costOfByModel(bucket.byModel, pricing).total }
    })
  const activeDays = Object.keys(scoped.byDay).length

  // The project table + Real Spend roll from all projects, but within the same
  // day range, so they reflect the selected window too.
  const full = rollupVault([...files], range)
  const spend =
    settings.monthlySubscription > 0
      ? attributeSpend(full, {
        monthlyAmount: settings.monthlySubscription,
        weight: settings.spendWeight,
        ...(pricing ? { pricing } : {})
      })
      : { byProject: {}, totalAllocated: 0, activeMonths: [] }

  const projects: ProjectRow[] = full.projects.map((p: ProjectUsage) => {
    const c = costOfByModel(p.byModel, pricing)
    return {
      project: p.project,
      totals: p.totals,
      tokens: totalTokens(p.totals),
      cost: c.total,
      unpriced: c.unpriced,
      realSpend: spend.byProject[p.project] ?? 0,
      sessions: p.sessions,
      ...(p.lastAt ? { lastAt: p.lastAt } : {})
    }
  })

  const models: ModelRow[] = Object.entries(scoped.byModel)
    .map(([model, u]) => {
      const c = costOf(u, model, pricing)
      return { model, tokens: totalTokens(u), cost: c.total, unpriced: c.unpriced }
    })
    .sort((a, b) => b.tokens - a.tokens)

  // Only models that actually cost something matter here: Claude Code emits
  // `<synthetic>` turns (errors, limit notices) that carry zero tokens, and
  // naming those as "unpriced" is noise, not a missing rate.
  const unpricedModels = models.filter((m) => m.unpriced && m.tokens > 0).map((m) => m.model)

  const totalTok = totalTokens(scoped.global.totals)
  const delegatedTok = totalTokens(scoped.delegated)
  const agentTypes: AgentTypeRow[] = Object.entries(scoped.byAgentType)
    .map(([agentType, bucket]) => {
      const c = costOfByModel(bucket.byModel, pricing)
      return { agentType, tokens: totalTokens(bucket.totals), cost: c.total, unpriced: c.unpriced }
    })
    .sort((a, b) => b.tokens - a.tokens)

  const delegation: DelegationView = {
    tokens: delegatedTok,
    share: totalTok > 0 ? delegatedTok / totalTok : 0,
    cost: agentTypes.reduce((n, t) => n + t.cost, 0),
    runs: scoped.agentRuns,
    runsPerSession: scoped.sessions.length > 0 ? scoped.agentRuns / scoped.sessions.length : 0,
    peakParallel: scoped.concurrency.maxAgents,
    types: agentTypes
  }

  const shares = concurrencyShares(scoped.concurrency)
  const parallelism: ParallelismView = {
    ...scoped.concurrency,
    busyHours: busyHours(scoped.concurrency),
    shares,
    soloShare: shares.find((s) => s.level === 1)?.share ?? 0
  }

  return {
    totals: scoped.global.totals,
    cost,
    sessionCount: scoped.sessions.length,
    projectCount: scoped.projects.length,
    activeDays,
    messageCount: scoped.sessions.reduce((n: number, s: SessionUsage) => n + s.messages, 0),
    ...(topModelOf(scoped.byModel) ? { topModel: topModelOf(scoped.byModel) } : {}),
    effortHours: effortHours(scoped.global.totals.output, settings.effort),
    unpricedModels,
    projects,
    series,
    heat: scoped.byWeekdayHour,
    sessionTokens: scoped.sessions.map((s: SessionUsage) => totalTokens(s.totals)),
    models,
    delegation,
    parallelism,
    limits: limitsViewOf(scoped.limits),
    realSpendTotal: spend.totalAllocated,
    activeMonths: spend.activeMonths
  }
}

/**
 * Fold raw rejections into the limits card. One wall turns away every request in
 * flight - main sessions and their subagents alike - so the raw event count
 * overstates how often you were actually blocked; rejections sharing a reset
 * time are collapsed into a single incident.
 */
function limitsViewOf(events: readonly LimitEvent[]): LimitsView {
  const byType: Record<string, number> = {}
  const incidents = new Set<string>()
  const days = new Set<string>()
  for (const e of events) {
    const type = e.type ?? '(unknown)'
    byType[type] = (byType[type] ?? 0) + 1
    incidents.add(`${type}:${e.resetsAt ?? e.day}`)
    days.add(e.day)
  }
  return { events: [...events], byType, incidents: incidents.size, daysHit: days.size }
}

export const DEFAULT_SETTINGS: UsageSettings = {
  monthlySubscription: 0,
  spendWeight: 'cost',
  effort: { outputTokensPerHour: 4000 },
  quota: { useMeasured: true }
}
