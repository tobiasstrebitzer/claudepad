// @/usage - derive.ts
//
// Pure view-model for the dashboard: rolls FileAggregates under the active
// project/date filters and layers cost, Real Spend, and effort on top. Keeps the
// chart components dumb and the whole transform unit-testable. Re-rolling is a
// cheap merge, so filter changes recompute instantly off the cached aggregates.

import { rollupVault, totalTokens, type DayRange } from './aggregate'
import { attributeSpend, type SpendWeight } from './attribution'
import { effortHours, type EffortConfig } from './effort'
import { costOf, costOfByModel, type CostBreakdown, type ModelRate } from './pricing'
import type { FileAggregate, ProjectUsage, SessionUsage, TokenUsage } from './types'

export interface UsageSettings {
  /** Subscription charged per month, USD. 0 = Real Spend disabled. */
  monthlySubscription: number
  spendWeight: SpendWeight
  effort: EffortConfig
  pricing?: Record<string, ModelRate>
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

export interface DashboardView {
  totals: TokenUsage
  cost: CostBreakdown
  sessionCount: number
  projectCount: number
  activeDays: number
  topModel?: { model: string; tokenShare: number }
  effortHours: number
  unpricedModels: string[]
  projects: ProjectRow[]
  series: DayPoint[]
  heat: number[][]
  /** Tokens-per-session totals (raw), for the histogram. */
  sessionTokens: number[]
  models: ModelRow[]
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

  const unpricedModels = models.filter((m) => m.unpriced).map((m) => m.model)

  return {
    totals: scoped.global.totals,
    cost,
    sessionCount: scoped.sessions.length,
    projectCount: scoped.projects.length,
    activeDays,
    ...(topModelOf(scoped.byModel) ? { topModel: topModelOf(scoped.byModel) } : {}),
    effortHours: effortHours(scoped.global.totals.output, settings.effort),
    unpricedModels,
    projects,
    series,
    heat: scoped.byWeekdayHour,
    sessionTokens: scoped.sessions.map((s: SessionUsage) => totalTokens(s.totals)),
    models,
    realSpendTotal: spend.totalAllocated,
    activeMonths: spend.activeMonths
  }
}

export const DEFAULT_SETTINGS: UsageSettings = {
  monthlySubscription: 0,
  spendWeight: 'cost',
  effort: { outputTokensPerHour: 4000 }
}
