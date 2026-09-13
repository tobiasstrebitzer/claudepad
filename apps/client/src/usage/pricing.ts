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
// read 0.1x. Output is billed separately. A few models price cache reads off
// that ladder (Fable 5.1 reads at $0.25/MTok, not $1.00), so `rate()` takes an
// explicit override rather than always deriving.
//
// Keeping this table current is load-bearing: an unpriced model is silently
// worth $0, so a missing entry for the model you actually use understates the
// estimate by an order of magnitude. `costOfByModel` therefore reports the
// unpriced token *share*, and the UI warns instead of showing a confident
// number (see CostBreakdown.unpricedShare).

import type { TokenUsage } from '@/schema'
import { totalTokens } from './aggregate'
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

const ASOF = '2026-09-10'
const SOURCE = 'platform.claude.com/docs pricing (bundled)'

/** Shown wherever a dollar figure appears (honesty over polish). */
export const ASOF_NOTE = `Rates bundled as of ${ASOF}; editable. A subscription is a flat fee - this is what the same usage would cost on the pay-as-you-go API.`

/**
 * Build a rate row from base input/output. Cache tiers derive from input unless
 * `cacheRead` is given (some models price reads off the 0.1x ladder).
 */
function rate(model: string, input: number, output: number, cacheRead?: number): ModelRate {
  return {
    model,
    asOf: ASOF,
    source: SOURCE,
    input,
    output,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheRead: cacheRead ?? input * 0.1
  }
}

/** Bundled defaults. Keys are canonical (date-suffix-stripped) model ids. */
export const DEFAULT_PRICING: Record<string, ModelRate> = {
  // Fable tier. 5.1 reads cache at a flat $0.25/MTok, off the 0.1x ladder.
  'claude-fable-5-1': rate('claude-fable-5-1', 10, 50, 0.25),
  'claude-fable-5': rate('claude-fable-5', 10, 50),
  'claude-mythos-5-1': rate('claude-mythos-5-1', 10, 50, 0.25),
  'claude-mythos-5': rate('claude-mythos-5', 10, 50),
  // Opus tier.
  'claude-opus-5': rate('claude-opus-5', 5, 25),
  'claude-opus-4-8': rate('claude-opus-4-8', 5, 25),
  'claude-opus-4-7': rate('claude-opus-4-7', 5, 25),
  'claude-opus-4-6': rate('claude-opus-4-6', 5, 25),
  'claude-opus-4-5': rate('claude-opus-4-5', 5, 25),
  // Sonnet tier.
  'claude-sonnet-5': rate('claude-sonnet-5', 2, 10),
  'claude-sonnet-4-6': rate('claude-sonnet-4-6', 3, 15),
  'claude-sonnet-4-5': rate('claude-sonnet-4-5', 3, 15),
  // Haiku tier.
  'claude-haiku-4-5': rate('claude-haiku-4-5', 1, 5)
}

/**
 * Normalize a raw model id to a pricing key: drop a trailing `-YYYYMMDD` date
 * snapshot (`claude-haiku-4-5-20251001` -> `claude-haiku-4-5`) and a context
 * marker (`claude-opus-5[1m]` -> `claude-opus-5`) - the long-context variant
 * is the same model at the same rates.
 */
export function canonicalModel(model: string): string {
  return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
}

export interface CostBreakdown {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  /** Sum of the above, USD - covers priced models only. */
  total: number
  /** True when *nothing* in scope could be priced, so `total` is meaningless. */
  unpriced: boolean
  /** Tokens that carried no rate and contributed $0 to `total`. */
  unpricedTokens: number
  /**
   * 0..1 share of tokens with no rate. `total` understates the true cost by
   * roughly this much, so anything non-trivial must be surfaced rather than
   * shown as a confident number - a single missing entry for a model that is
   * 90% of your usage is a 10x understatement that otherwise looks fine.
   */
  unpricedShare: number
}

/** Above this share of unpriced tokens, a total is too wrong to show plainly. */
export const UNPRICED_WARN_SHARE = 0.005

/**
 * The slice of a cost that a Claude subscription's rate limits actually meter:
 * fresh input + output + cache writes. **Cache reads are free to the meter.**
 *
 * Established by regressing measured `utilization` telemetry against token spend
 * across 24 five-hour windows (D-100): weighting cache reads at anything above
 * zero monotonically worsened the fit (spread across windows 18% -> 34%). It is
 * also the intuitive answer - a cache hit costs Anthropic almost nothing, so
 * they do not charge your quota for it.
 *
 * This is why quota burn feels erratic: two sessions with identical *total*
 * tokens can consume wildly different amounts of limit, because only the
 * uncached part counts.
 */
export function meteredCost(c: CostBreakdown): number {
  return c.input + c.output + c.cacheWrite
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
    const tokens = totalTokens(usage)
    return {
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
      total: 0,
      unpriced: true,
      unpricedTokens: tokens,
      unpricedShare: tokens > 0 ? 1 : 0
    }
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
    unpriced: false,
    unpricedTokens: 0,
    unpricedShare: 0
  }
}

/** Estimated cost of a per-model split (sums each model at its own rate). */
export function costOfByModel(
  byModel: ByModel,
  pricing: Record<string, ModelRate> = DEFAULT_PRICING
): CostBreakdown {
  const acc: CostBreakdown = {
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    total: 0,
    unpriced: false,
    unpricedTokens: 0,
    unpricedShare: 0
  }
  let anyPriced = false
  let tokens = 0
  for (const [model, usage] of Object.entries(byModel)) {
    tokens += totalTokens(usage)
    const c = costOf(usage, model, pricing)
    if (c.unpriced) {
      acc.unpricedTokens += c.unpricedTokens
      continue
    }
    anyPriced = true
    acc.input += c.input
    acc.output += c.output
    acc.cacheWrite += c.cacheWrite
    acc.cacheRead += c.cacheRead
    acc.total += c.total
  }
  acc.unpriced = !anyPriced && Object.keys(byModel).length > 0
  acc.unpricedShare = tokens > 0 ? acc.unpricedTokens / tokens : 0
  return acc
}

/** Convenience: estimated total cost of a day/month bucket. */
export function costOfBucket(
  bucket: UsageBucket,
  pricing: Record<string, ModelRate> = DEFAULT_PRICING
): number {
  return costOfByModel(bucket.byModel, pricing).total
}
