// @/usage - attribution.ts
//
// "Real Spend" (PRD-13 FR-7): attribute a user-entered subscription amount
// across projects. This is an ALLOCATION, not a bill - a Pro/Max subscriber
// pays a flat fee, and this distributes it by each project's share of usage.
//
// Default (OQ-3): est-cost share, per-month. Each calendar month's subscription
// amount is split across the projects active that month, weighted by their
// estimated API-equivalent cost, then summed across the active range. Weighting
// by raw tokens is offered as an alternative basis.

import type { UsageBucket, VaultUsage } from './types'
import { totalTokens } from './aggregate'
import { costOfByModel, DEFAULT_PRICING, type ModelRate } from './pricing'

export type SpendWeight = 'cost' | 'tokens'

export interface SpendOptions {
  /** Subscription amount charged per month, USD. */
  monthlyAmount: number
  /** Weighting basis. Default 'cost' (est API-equivalent cost share). */
  weight?: SpendWeight
  /** Inclusive month range `YYYY-MM`; omit a bound to leave it open. */
  fromMonth?: string
  toMonth?: string
  pricing?: Record<string, ModelRate>
}

export interface SpendAllocation {
  /** Allocated dollars per project. */
  byProject: Record<string, number>
  /** Sum allocated = monthlyAmount x number of active months in range. */
  totalAllocated: number
  /** Months that had any weighted activity (and so drew a subscription charge). */
  activeMonths: string[]
}

function weightOf(bucket: UsageBucket, basis: SpendWeight, pricing: Record<string, ModelRate>): number {
  return basis === 'tokens' ? totalTokens(bucket.totals) : costOfByModel(bucket.byModel, pricing).total
}

function inRange(month: string, from?: string, to?: string): boolean {
  if (from && month < from) return false
  if (to && month > to) return false
  return true
}

/**
 * Allocate the subscription across projects (FR-7). Per month, each project's
 * share = its weight / the month's total weight; the month's `monthlyAmount` is
 * split by that share and summed per project. Months with zero total weight are
 * skipped (no charge attributed), so `totalAllocated` reflects only active
 * months - an honest allocation rather than a fabricated bill.
 */
export function attributeSpend(vault: VaultUsage, opts: SpendOptions): SpendAllocation {
  const basis = opts.weight ?? 'cost'
  const pricing = opts.pricing ?? DEFAULT_PRICING

  // Pivot byProjectMonth into per-month maps of project -> weight.
  const monthly: Record<string, Record<string, number>> = {}
  for (const [project, months] of Object.entries(vault.byProjectMonth)) {
    for (const [month, bucket] of Object.entries(months)) {
      if (!inRange(month, opts.fromMonth, opts.toMonth)) continue
      const w = weightOf(bucket, basis, pricing)
      if (w <= 0) continue
      ;(monthly[month] ??= {})[project] = (monthly[month]?.[project] ?? 0) + w
    }
  }

  const byProject: Record<string, number> = {}
  const activeMonths: string[] = []
  for (const [month, projects] of Object.entries(monthly)) {
    const total = Object.values(projects).reduce((n, w) => n + w, 0)
    if (total <= 0) continue
    activeMonths.push(month)
    for (const [project, w] of Object.entries(projects)) {
      byProject[project] = (byProject[project] ?? 0) + opts.monthlyAmount * (w / total)
    }
  }

  return {
    byProject,
    totalAllocated: opts.monthlyAmount * activeMonths.length,
    activeMonths: activeMonths.sort()
  }
}

/** Human-readable description of the method, shown next to the figures. */
export function spendMethodLabel(opts: Pick<SpendOptions, 'weight'>): string {
  const basis = (opts.weight ?? 'cost') === 'tokens' ? 'raw-token share' : 'estimated-cost share'
  return `Allocation by ${basis}, per calendar month. Not a bill - your subscription is a flat fee; this distributes it across projects by usage.`
}
