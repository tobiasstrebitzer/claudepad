// Presentation pacing (PRD-08 §6.3, Q-5). Pure, data-driven, unit-testable in
// isolation. Every knob lives in one typed config so tuning v1 numbers against
// real recorded sessions is a data change, not a code change. Operates on the
// viewer's render rows (correlated tool_use↔tool_result), so dwell is computed
// on exactly what the audience sees - and on the *rendered, tier-appropriate*
// content (secret placeholders count as their label only, FR-19).

import type { ContentBlock } from '@/schema'
import type { RenderRow } from '../viewer/hooks/useCorrelateTools'

export interface PacingWeights {
  text: number
  thinking: number
  code: number
  toolIo: number
  image: number
}

export interface PacingConfig {
  /** chars / second - the dominant reading-speed knob (≈ presentation skim). */
  readingSpeed: number
  /** seconds floor so even a tiny event registers. */
  baseDwell: number
  minDwell: number
  maxDwell: number
  /** seconds added per image (converted to char-equivalent reading cost). */
  imageCost: number
  /** weighted-char cap per tool I/O field - don't read a 5k-line file aloud. */
  toolIoCap: number
  /** seconds: an original inter-event gap above this is "idle" and collapses. */
  idleThreshold: number
  /** seconds: the compressed beat a collapsed idle gap becomes. */
  idleCollapsed: number
  /** seconds: real-time-mode clamp so a human thinking-pause can't stall playback. */
  maxRealtimeGap: number
  /** ≥ this many same-name tool rows in a row ⇒ fold into one beat. */
  toolSpamRun: number
  /** Row kinds that are de-emphasised in the viewer (e.g. collapsed thinking)
   * and so get fast-tracked in presentation mode - capped to a short beat. */
  fastTrackKinds: string[]
  /** seconds: dwell cap applied to `fastTrackKinds` rows in presentation mode. */
  fastTrackMaxDwell: number
  weights: PacingWeights
}

// Defaults (PRD-08 §6.3). Treated as a tunable starting point, not contract.
// Calibrated so the default 1x feels like the previous 1.5x (the old pace read
// too slow) - reading is ~1.5x faster and dwell floors/caps shrink to match.
export const DEFAULT_PACING: PacingConfig = {
  readingSpeed: 42,
  baseDwell: 0.3,
  minDwell: 0.2,
  maxDwell: 8,
  imageCost: 1.3,
  toolIoCap: 600,
  idleThreshold: 20,
  idleCollapsed: 0.55,
  maxRealtimeGap: 10,
  toolSpamRun: 3,
  // Thinking is usually collapsed/hidden in the viewer and meta is incidental -
  // don't make the audience wait on them; cap to a brief beat.
  fastTrackKinds: ['thinking', 'meta'],
  fastTrackMaxDwell: 0.7,
  weights: { text: 1, thinking: 0.6, code: 0.35, toolIo: 0.25, image: 0 }
}

/** Discrete transport speeds (FR-5). */
export const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 4, 8] as const
export type Speed = (typeof SPEEDS)[number]

/** Seek-by-step for ←/→ (FR-23), in ms of virtual time. */
export const SEEK_STEP_MS = 5000

/** Reveal style for a turn during playback (PRD-08 FR-17). */
export type AppearMode = 'instant' | 'type'

/** Fraction of a typed turn's dwell reserved as a pause after the text finishes
 * (feels more natural than starting the next turn the instant typing ends). */
export const TYPING_BUFFER_RATIO = 0.18

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))

export const mergePacing = (partial?: Partial<PacingConfig>): PacingConfig =>
  partial
    ? { ...DEFAULT_PACING, ...partial, weights: { ...DEFAULT_PACING.weights, ...partial.weights } }
    : DEFAULT_PACING

function jsonLen(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'string') return v.length
  try {
    return JSON.stringify(v).length
  } catch {
    return 0
  }
}

function blocksCost(blocks: ContentBlock[], cfg: PacingConfig, thinking: boolean): number {
  let cost = 0
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        cost += block.text.length * (thinking ? cfg.weights.thinking : cfg.weights.text)
        break
      case 'code':
        cost += block.text.length * cfg.weights.code
        break
      case 'image':
        // Convert a flat per-image cost into char-equivalent reading cost.
        cost += cfg.imageCost * cfg.readingSpeed
        break
      case 'raw':
        cost += Math.min(jsonLen(block.value), cfg.toolIoCap) * cfg.weights.toolIo
        break
    }
  }
  return cost
}

/**
 * Weighted "reading cost" of a render row in chars (FR-10). Content types are
 * weighted so scannable content (code, tool output) reads faster than prose.
 */
export function weightedCharCount(row: RenderRow, cfg: PacingConfig): number {
  if (row.kind === 'tool') {
    const input = Math.min(jsonLen(row.event.input), cfg.toolIoCap)
    const output = row.result ? Math.min(jsonLen(row.result.output), cfg.toolIoCap) : 0
    return (input + output) * cfg.weights.toolIo
  }
  if (row.kind === 'orphan-result') {
    return Math.min(jsonLen(row.event.output), cfg.toolIoCap) * cfg.weights.toolIo
  }
  const event = row.event
  switch (event.kind) {
    case 'user':
    case 'assistant':
      return blocksCost(event.content, cfg, false)
    case 'thinking':
      return blocksCost(event.content, cfg, true)
    case 'meta':
      return event.note.length * cfg.weights.text
    default:
      return 0
  }
}

/** Presentation dwell for a row, in ms (FR-9). */
export function dwellPresentMs(row: RenderRow, cfg: PacingConfig): number {
  const seconds = clamp(
    cfg.baseDwell + weightedCharCount(row, cfg) / cfg.readingSpeed,
    cfg.minDwell,
    cfg.maxDwell
  )
  return Math.round(seconds * 1000)
}

/** Sublinear dwell for a folded tool-spam run of length k, in ms (FR-12). */
export function spamDwellMs(k: number, cfg: PacingConfig): number {
  return Math.round((cfg.baseDwell + 0.5 * Math.log2(k)) * 1000)
}
