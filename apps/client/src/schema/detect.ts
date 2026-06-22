// detect.ts - input-form detection (FR-4), source detection by structure
// (FR-7), and best-effort version detection (FR-8/FR-9).

import type { ParseStats, SessionSource } from './types'
import { tokenizeLines } from './tokenize'

export type InputForm = ParseStats['inputForm']

/** A parsed source record (one JSON object from a JSONL line). */
export type RawRecord = Record<string, unknown>

export interface FormDetection {
  form: InputForm
  /** Records parsed when the input is jsonl or single-json. */
  records: RawRecord[]
}

/**
 * Heuristically detect the input form (FR-4). Side-effect-free.
 *
 * - `jsonl`: ≥1 line parses as a JSON object (the common Claude Code case).
 * - `single-json`: the whole input is one JSON object/array (a pasted message).
 * - `clipboard-fragment`: non-empty text that is not valid JSON.
 * - `unknown`: empty / whitespace-only.
 */
export function detectInputForm(input: string): FormDetection {
  const trimmedWhole = input.trim()
  if (trimmedWhole.length === 0) {
    return { form: 'unknown', records: [] }
  }

  const lines = tokenizeLines(input)

  // Collect the lines that parse to JSON objects.
  const objectRecords: RawRecord[] = []
  for (const l of lines) {
    const parsed = tryParse(l.text)
    if (parsed !== undefined && isObject(parsed)) objectRecords.push(parsed)
  }

  // Multi-line with at least one JSON object → jsonl.
  if (lines.length > 1 && objectRecords.length >= 1) {
    return { form: 'jsonl', records: objectRecords }
  }

  // Single logical JSON value spanning the whole input → single-json.
  const whole = tryParse(trimmedWhole)
  if (whole !== undefined) {
    if (Array.isArray(whole)) {
      const arrRecords = whole.filter(isObject)
      return { form: 'single-json', records: arrRecords }
    }
    if (isObject(whole)) {
      return { form: 'single-json', records: [whole] }
    }
    // A bare scalar (number/string/bool) → treat as a fragment.
    return { form: 'clipboard-fragment', records: [] }
  }

  // One JSON object line but not whole-input-parseable: still jsonl-ish.
  if (objectRecords.length >= 1) {
    return { form: 'jsonl', records: objectRecords }
  }

  // Non-empty, non-JSON text → human-pasted fragment.
  return { form: 'clipboard-fragment', records: [] }
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function isObject(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Structural source detection (FR-7). Returns a confidence 0..1 that the
 * records came from Claude Code, based on structural signals - never filename.
 */
export function detectClaudeCodeConfidence(records: RawRecord[]): number {
  if (records.length === 0) return 0
  let hits = 0
  let considered = 0
  for (const r of records) {
    considered++
    let recordScore = 0
    if (typeof r['sessionId'] === 'string') recordScore++
    if (typeof r['uuid'] === 'string') recordScore++
    if ('parentUuid' in r) recordScore++
    if (typeof r['type'] === 'string') recordScore++
    const msg = r['message']
    if (isObject(msg) && (typeof msg['role'] === 'string' || 'content' in msg)) {
      recordScore++
    }
    if (typeof r['version'] === 'string') recordScore++
    // Any 2+ structural signals on a record is a strong vote.
    if (recordScore >= 2) hits++
  }
  return considered === 0 ? 0 : hits / considered
}

export function detectSource(_records: RawRecord[]): SessionSource {
  // v1 only knows claude-code; default to it regardless of confidence so a
  // fragment still produces a renderable session.
  return 'claude-code'
}

export interface VersionDetection {
  /** Most frequent `version` value, or 'unknown'. */
  version: string
  /** True when records disagreed on the version (FR-8). */
  mismatch: boolean
  /** Distinct version values observed, with counts. */
  counts: Record<string, number>
}

/** Best-effort version detection from the `version` field (FR-8). */
export function detectVersion(records: RawRecord[]): VersionDetection {
  const counts: Record<string, number> = {}
  for (const r of records) {
    const v = r['version']
    if (typeof v === 'string' && v.length > 0) {
      counts[v] = (counts[v] ?? 0) + 1
    }
  }
  const entries = Object.entries(counts)
  if (entries.length === 0) {
    return { version: 'unknown', mismatch: false, counts }
  }
  // Most frequent wins; deterministic tiebreak by version string.
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const top = entries[0]
  const version = top ? top[0] : 'unknown'
  return { version, mismatch: entries.length > 1, counts }
}
