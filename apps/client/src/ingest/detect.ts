import type { IngestShape } from './types'

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return undefined
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Classify a pasted/dropped text payload so the ingest layer can route it to the
 * PRD-02 parser or reject it with guidance (PRD-04 §4.3, FR-6). Pure & side-effect-free.
 *
 * - a single JSON object            → 'json-object'
 * - a single JSON array             → 'json-array'
 * - newline-delimited JSON objects  → 'jsonl'  (≥1 line parses to an object)
 * - anything else (prose/empty/bin) → 'unknown'  (caller shows the rejection UI)
 *
 * Note: 'ndjson' is a synonym of 'jsonl' for routing; the parser treats them the
 * same, so line-delimited input always classifies as 'jsonl'. The 'ndjson' member
 * is kept in the union for callers/CLI that want to distinguish it explicitly.
 */
export function classify(payload: string): IngestShape {
  const s = payload.replace(/^\uFEFF/, '').trim()
  if (s === '') return 'unknown'

  // Whole-payload JSON: a single object or array (e.g. one pasted message / event list).
  const whole = tryParse(s)
  if (Array.isArray(whole)) return 'json-array'
  if (isObject(whole)) return 'json-object'

  // Otherwise, look for newline-delimited JSON objects (a .jsonl session).
  const lines = s.split(/\r?\n/).map((l) => l.trim())
  let nonEmpty = 0
  let objectLines = 0
  for (const line of lines) {
    if (line === '') continue
    nonEmpty++
    if (isObject(tryParse(line))) objectLines++
  }
  if (nonEmpty >= 1 && objectLines >= 1) return 'jsonl'

  return 'unknown'
}

/** A payload is ingestible iff it classifies to anything but 'unknown'. */
export function isIngestible(payload: string): boolean {
  return classify(payload) !== 'unknown'
}
