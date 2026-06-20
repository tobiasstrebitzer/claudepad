// version.ts - known Claude Code version range + capability comparison.
//
// The adapter was authored against the observed corpus spanning 2.1.140 …
// 2.1.183. When a session reports a NEWER version, the parser still maps it and
// emits a non-blocking `newer-format` diagnostic (FR-9).

export const HIGHEST_KNOWN_VERSION = '2.1.183';
export const LOWEST_KNOWN_VERSION = '2.1.140';

/**
 * Parse a dotted version like "2.1.177" into numeric components. Non-numeric or
 * malformed parts become 0 so comparison stays total and never throws.
 */
function parseVersionParts(v: string): number[] {
  return v.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

/** Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** True when `version` is strictly newer than the highest authored version. */
export function isNewerThanKnown(version: string): boolean {
  if (version === 'unknown') return false;
  // Only treat well-formed "2.1.x"-shaped versions as comparable.
  if (!/^\d+\.\d+/.test(version)) return false;
  return compareVersions(version, HIGHEST_KNOWN_VERSION) > 0;
}
