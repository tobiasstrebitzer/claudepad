// The placeholder token grammar (PRD-06 FR-20…FR-22, FR-30). This PRD OWNS the
// grammar; the viewer (packages/client/src/viewer/secret-token.ts) RENDERS it and
// MUST stay byte-compatible - `placeholder.test.ts` pins the exact form so the two
// can't drift.
//
//     ⟦cp-secret:<id>:<TYPE>:<len>⟧      e.g. ⟦cp-secret:s7f3:AWS_KEY:20⟧
//
// The token carries only an opaque id, a type label, and the value's length -
// NEVER any substring/prefix/hash of the value (SECURITY-MODEL §Placeholder).

const OPEN = '⟦';
const CLOSE = '⟧';

/** Build the placeholder token for a redacted value. */
export function makeSecretToken(id: string, type: string, len: number): string {
  return `${OPEN}cp-secret:${id}:${type}:${len}${CLOSE}`;
}

/** Type labels are constrained to the token's safe charset (no delimiters/colons). */
export function sanitizeType(type: string): string {
  const cleaned = type.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_');
  return cleaned.replace(/^_|_$/g, '') || 'SECRET';
}

/**
 * Neutralize any literal sentinel already present in source text so it can't be
 * confused with a real token after redaction (FR-29/FR-30 forgery guard).
 */
export function neutralizeSentinels(text: string): string {
  return text.split(OPEN).join('[').split(CLOSE).join(']');
}
