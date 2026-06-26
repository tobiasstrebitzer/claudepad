/**
 * Client-side guards (registry-spec.md §8, D-77). The load-bearing rule: a
 * registry URL MUST be https://, with a single localhost exception for dev. No
 * plaintext HTTP, ever. Also a tolerant manifest parser that fails closed on a
 * registry that doesn't declare TLS.
 */

import type { RegistryManifest, RegistryMode } from './manifest'
import { RegistryError } from './errors'

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLocalhostHostname(hostname: string): boolean {
  return LOCALHOST_HOSTNAMES.has(hostname)
}

/**
 * True if `url` is an acceptable registry base URL: https anywhere, or http only
 * on localhost (dev). Anything else (http to a real host, ws, file, garbage) is
 * rejected.
 */
export function isAllowedRegistryUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol === 'http:' && isLocalhostHostname(parsed.hostname)) return true
  return false
}

/** Throw `tls_required` unless `url` passes {@link isAllowedRegistryUrl}. */
export function assertAllowedRegistryUrl(url: string): void {
  if (!isAllowedRegistryUrl(url)) {
    throw new RegistryError(
      'tls_required',
      `Registry URL must be https:// (or http://localhost for dev): ${url}`
    )
  }
}

const VALID_MODES: ReadonlySet<RegistryMode> = new Set<RegistryMode>([
  'zero-knowledge',
  'trusted'
])

/**
 * Tolerantly parse + validate a manifest JSON. Forward-compatible (unknown
 * fields ignored) but fails closed on the security-relevant invariants: a real
 * https baseUrl, `tls: 'required'`, and at least one known mode.
 */
export function parseManifest(value: unknown): RegistryManifest {
  if (typeof value !== 'object' || value === null) {
    throw new RegistryError('bad_request', 'Manifest is not an object')
  }
  const m = value as Record<string, unknown>

  if (typeof m['id'] !== 'string' || typeof m['name'] !== 'string') {
    throw new RegistryError('bad_request', 'Manifest missing id/name')
  }
  if (typeof m['baseUrl'] !== 'string' || !isAllowedRegistryUrl(m['baseUrl'])) {
    throw new RegistryError('tls_required', 'Manifest baseUrl must be https:// (or localhost)')
  }
  if (m['tls'] !== 'required') {
    throw new RegistryError('tls_required', 'Manifest must declare tls: \'required\'')
  }

  const rawModes = Array.isArray(m['modes']) ? m['modes'] : []
  const modes = rawModes.filter(
    (x): x is RegistryMode => typeof x === 'string' && VALID_MODES.has(x as RegistryMode)
  )
  if (modes.length === 0) {
    throw new RegistryError('bad_request', 'Manifest declares no known mode')
  }

  // Pass the validated core through; extra fields (directory, trustedAtRest,
  // store, future additions) ride along untouched.
  return { ...(m as object), modes } as RegistryManifest
}
