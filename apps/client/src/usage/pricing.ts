// @/usage - pricing.ts
//
// Bundled, honestly-dated price table for the API-equivalent cost estimate
// (PRD-13 FR-4/5/6). NOT a bill: a Pro/Max subscriber does not pay per token -
// this models what the same usage would have cost on the pay-as-you-go API, so
// you can see relative spend across projects. No network fetch (keeps
// check-no-external-origins green); overrides persist locally via idbKv.
//
// Rates are USD per million tokens. Cache economics matter: a cache *read* is
// ~10x cheaper than fresh input, and a 1h cache *write* is ~2x fresh input -
// collapsing these into one "token" rate would make the estimate meaningless.
// Anthropic's published multipliers off base input: 5m write 1.25x, 1h write 2x,
// read 0.1x. Output is billed separately.

import type { TokenUsage } from '@/schema'
import type { ByModel, UsageBucket } from './types'

export interface ModelRate {
  /** Canonical model id this rate applies to. */
  model: string
  /** ISO date the rates were last confirmed (shown to the user). */
  asOf: string
  source?: string
  input: number // per MTok, fresh input
  output: number // per MTok, output
  cacheWrite5m: number // per MTok, ephemeral 5m cache write (1.25x input)
  cacheWrite1h: number // per MTok, ephemeral 1h cache write (2x input)
  cacheRead: number // per MTok, cache read (0.1x input)
}

const ASOF = '2026-06-04'
const SOURCE = 'platform.claude.com/docs pricing (bundled)'

/** Shown wherever a dollar figure appears (honesty over polish). */
export const ASOF_NOTE = `Rates bundled as of ${ASOF}; editable. A subscription is a flat fee - this is what the same usage would cost on the pay-as-you-go API.`

/** Build a rate row from base input/output, deriving the cache tiers. */
function rate(model: string, input: number, output: number): ModelRate {
  return {
    model,
    asOf: ASOF,
    source: SOURCE,
    input,
    output,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheRead: input * 0.1
  }
}

/** Bundled defaults. Keys are canonical (date-suffix-stripped) model ids. */
export const DEFAULT_PRICING: Record<string, ModelRate> = {
  'claude-fable-5': rate('claude-fable-5', 10, 50),
  'claude-opus-4-8': rate('claude-opus-4-8', 5, 25),
  'claude-opus-4-7': rate('claude-opus-4-7', 5, 25),
  'claude-opus-4-6': rate('claude-opus-4-6', 5, 25),
  'claude-opus-4-5': rate('claude-opus-4-5', 5, 25),
  'claude-sonnet-4-6': rate('claude-sonnet-4-6', 3, 15),
  'claude-sonnet-4-5': rate('claude-sonnet-4-5', 3, 15),
  'claude-haiku-4-5': rate('claude-haiku-4-5', 1, 5)
}

/**
 * Normalize a raw model id to a pricing key: drop a trailing `-YYYYMMDD` date
 * snapshot (e.g. `claude-haiku-4-5-20251001` -> `claude-haiku-4-5`).
 */
export function canonicalModel(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

export interface CostBreakdown {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  /** Sum of the above, USD. */
  total: number
  /** True when no rate was found for the model (counted in tokens, not cost). */
  unpriced: boolean
}

const MTOK = 1_000_000

/**
 * Estimated API-equivalent cost of a usage block under a pricing table (FR-5).
 * Cache writes are split into 1h/5m tiers when the source provided the split;
 * otherwise the whole `cacheCreate` is priced at the 5m rate (the common case).
 * Unknown models return `unpriced: true` with a zero cost - never mis-priced.
 */
export function costOf(
  usage: TokenUsage,
  model: string | undefined,
  pricing: Record<string, ModelRate> = DEFAULT_PRICING
): CostBreakdown {
  const r = model ? pricing[canonicalModel(model)] : undefined
  if (!r) {
    return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, unpriced: true }
  }

  const has1h = usage.cacheCreate1h !== undefined || usage.cacheCreate5m !== undefined
  const create1h = usage.cacheCreate1h ?? 0
  const create5m = has1h ? (usage.cacheCreate5m ?? 0) : usage.cacheCreate

  const input = (usage.input / MTOK) * r.input
  const output = (usage.output / MTOK) * r.output
  const cacheWrite = (create1h / MTOK) * r.cacheWrite1h + (create5m / MTOK) * r.cacheWrite5m
  const cacheRead = (usage.cacheRead / MTOK) * r.cacheRead

  return {
    input,
    output,
    cacheWrite,
    cacheRead,
    total: input + output + cacheWrite + cacheRead,
    unpriced: false
  }
}

/** Estimated cost of a per-model split (sums each model at its own rate). */
export function costOfByModel(
  byModel: ByModel,
  pricing: Record<string, ModelRate> = DEFAULT_PRICING
): CostBreakdown {
  const acc: CostBreakdown = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, unpriced: false }
  let anyPriced = false
  for (const [model, usage] of Object.entries(byModel)) {
    const c = costOf(usage, model, pricing)
    if (c.unpriced) continue
    anyPriced = true
    acc.input += c.input
    acc.output += c.output
    acc.cacheWrite += c.cacheWrite
    acc.cacheRead += c.cacheRead
    acc.total += c.total
  }
  acc.unpriced = !anyPriced && Object.keys(byModel).length > 0
  return acc
}

/** Convenience: estimated total cost of a day/month bucket. */
export function costOfBucket(
  bucket: UsageBucket,
  pricing: Record<string, ModelRate> = DEFAULT_PRICING
): number {
  return costOfByModel(bucket.byModel, pricing).total
}
