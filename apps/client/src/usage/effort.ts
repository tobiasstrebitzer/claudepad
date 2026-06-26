// @/usage - effort.ts
//
// "Effort equivalent" (PRD-13 FR-8): a deliberately-rough, editable estimate of
// the human-hours the model's output stands in for. Default basis (OQ-2):
// output volume - effort scales with tokens produced, divided by a configurable
// human authoring rate. This is a directional TOY, not a metric; it is always
// shown with a "rough estimate" disclaimer and the formula visible/editable.

export interface EffortConfig {
  /**
   * Finished output a person produces per hour, in tokens. Default 4,000
   * (~3,000 words/hr of reviewed prose or code) - intentionally a round,
   * editable guess. Lower it to make the estimate more conservative.
   */
  outputTokensPerHour: number
}

export const DEFAULT_EFFORT: EffortConfig = {
  outputTokensPerHour: 4000
}

/** Effort-equivalent hours for a given output-token volume (FR-8). */
export function effortHours(outputTokens: number, cfg: EffortConfig = DEFAULT_EFFORT): number {
  const rate = cfg.outputTokensPerHour > 0 ? cfg.outputTokensPerHour : DEFAULT_EFFORT.outputTokensPerHour
  return outputTokens / rate
}

/** The formula, rendered for the UI so the toy is fully transparent. */
export function effortFormula(cfg: EffortConfig = DEFAULT_EFFORT): string {
  return `output tokens ÷ ${cfg.outputTokensPerHour.toLocaleString()} tokens/hour`
}

export const EFFORT_DISCLAIMER =
  'Rough estimate. A directional toy based on output volume, not a measurement of real work.'
