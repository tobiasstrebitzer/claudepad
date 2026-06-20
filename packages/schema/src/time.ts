// time.ts - ISO-8601 UTC normalization (FR-26).
//
// Valid ISO timestamps pass through (re-emitted as canonical UTC ISO);
// invalid/missing → undefined (never `Invalid Date`). Never invents a value.

/**
 * Normalize a candidate timestamp to a canonical ISO-8601 UTC string.
 * Returns undefined for missing, non-string, or unparseable inputs.
 */
export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

/** True when `a` is strictly earlier than `b` (both ISO strings). */
export function isBefore(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b);
}

/** Earliest of two ISO strings (either may be undefined). */
export function minIso(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return isBefore(a, b) ? a : b;
}

/** Latest of two ISO strings (either may be undefined). */
export function maxIso(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return isBefore(a, b) ? b : a;
}
