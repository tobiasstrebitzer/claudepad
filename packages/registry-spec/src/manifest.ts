/**
 * The capability manifest (REGISTRY-SPEC.md §6).
 *
 * Served at `/.well-known/claudepad-registry` so a client can feature-detect and
 * label trust honestly before any action that depends on it. Clients treat
 * unknown fields tolerantly (forward-compatible).
 */

import type { AssuranceLevel } from './directory'
import type { StoreCapabilities } from './store'

/** Confidentiality mode (REGISTRY-SPEC.md §4). */
export type RegistryMode =
  /** Default: the registry stores opaque ciphertext and cannot read sessions. */
  | 'zero-knowledge'
  /** Opt-in: the client uploads a readable session over TLS; the registry can read it. */
  | 'trusted'

export interface RegistryDirectoryCapability {
  enabled: boolean
  /** Assurance levels this registry can issue. */
  assurance: AssuranceLevel[]
  /** The org/domain backing domain/sso entries, surfaced in the UI. */
  verifiedBy?: string
}

export interface RegistryManifest {
  /** Stable identifier; also the namespace for federated results (OQ-R1). */
  id: string
  /** Human label shown in the UI. */
  name: string
  /** MUST be https:// (or http://localhost for dev). */
  baseUrl: string
  /** The only legal value; a client rejects a registry that doesn't declare it. */
  tls: 'required'
  /**
   * The web app this registry is paired with. When set, the registry serves a
   * `/s/:id` share short link that 302-redirects here (with `?share=<id>&r=<baseUrl>`)
   * so a shared link opens straight in the app. Absent => no short-link redirect.
   */
  webApp?: string
  /** Confidentiality modes this registry offers (§4). */
  modes: RegistryMode[]
  /** Directory capability (§5); absent => no identity directory. */
  directory?: RegistryDirectoryCapability
  /**
   * Honest, free-text at-rest posture for trusted mode (OQ-R4), e.g.
   * "AES-256 at rest, operator-held key". Shown before a trusted publish.
   * No conformance requirement beyond saying what you do.
   */
  trustedAtRest?: string
  /** Availability lifecycle the store supports. */
  store: StoreCapabilities
}

export function registrySupportsMode(manifest: RegistryManifest, mode: RegistryMode): boolean {
  return manifest.modes.includes(mode)
}

export function registryHasDirectory(manifest: RegistryManifest): boolean {
  return manifest.directory?.enabled === true
}
