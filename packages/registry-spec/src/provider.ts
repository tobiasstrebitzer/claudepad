/**
 * RegistryProvider - the store seam extended along the authenticity (directory)
 * and trusted-publish axes (REGISTRY-SPEC.md §6). A client talks to any
 * conformant registry through this interface; the v1 default is none.
 */

import type { DirectoryEntry } from './directory'
import type { RegistryManifest } from './manifest'
import type { StoreProvider, StorePutOptions, StoredRef } from './store'

export interface RegistryPutOptions extends StorePutOptions {
  /**
   * Opt-in inbox index (REGISTRY-SPEC.md §4.1): recipient public-key hashes the
   * registry may index so `inbox()` can serve this blob back. Off by default -
   * supplying it reveals the social graph (not content) to the registry.
   */
  indexFor?: string[]
}

export interface RegistryProvider extends StoreProvider {
  readonly manifest: RegistryManifest

  /** ZK availability: upload opaque ciphertext, optionally inbox-indexed. */
  put(blob: Uint8Array, opts?: RegistryPutOptions): Promise<StoredRef>

  // --- Authenticity: the directory (present only if manifest.directory.enabled) ---
  /** Resolve recipients by handle/name. Returns public cards only (ZK-safe). */
  lookup(query: string): Promise<DirectoryEntry[]>
  resolve(handle: string): Promise<DirectoryEntry | null>
  /** Publish/claim your own public card; the registry then verifies its assurance. */
  publishIdentity?(card: string): Promise<DirectoryEntry>
  /** Revoke = purge (OQ-R3). Rotation = re-publish under the same handle. */
  revokeIdentity?(handle: string): Promise<void>

  // --- Trusted mode (present only if manifest.modes includes 'trusted') ---
  /** Upload a READABLE session over TLS. The registry can read it - requires explicit consent. */
  putSession?(session: unknown, opts?: StorePutOptions): Promise<StoredRef>
  getSession?(id: string): Promise<unknown>

  /** List ids addressed to the authenticated identity (opt-in inbox index). */
  inbox?(): Promise<string[]>
}

/** v1 default: there is no registry. Every flow works fully offline. */
export const NoRegistryProvider: RegistryProvider | null = null
