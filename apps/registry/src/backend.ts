/**
 * Storage abstraction the request handler talks to. A Cloudflare adapter
 * (R2 + KV) and an in-memory adapter (tests / local dev) both implement it, so
 * the contract logic in handler.ts stays storage-agnostic.
 */

import type { DirectoryEntry } from '@claudepad/registry-spec'

export interface BlobMeta {
  /** Epoch ms after which the blob is gone. */
  expiresAt?: number
  burnAfterRead?: boolean
  /** Opaque inbox index keys (the client's recipient pub hashes). */
  indexFor?: string[]
}

export interface BlobRecord {
  bytes: Uint8Array
  meta: BlobMeta
}

export interface SessionRecord {
  json: unknown
  /** The authenticated identity id that owns this readable session. */
  owner: string
}

/** A stored directory entry plus the id of the key that owns the handle. */
export interface OwnedEntry {
  entry: DirectoryEntry
  owner: string
}

export interface RegistryBackend {
  // --- Zero-knowledge blobs ---
  putBlob(id: string, record: BlobRecord): Promise<void>
  getBlob(id: string): Promise<BlobRecord | null>
  deleteBlob(id: string): Promise<boolean>
  /** Ids whose `indexFor` contains `inboxKey`. */
  listInbox(inboxKey: string): Promise<string[]>

  // --- Trusted-mode readable sessions ---
  putSession(id: string, record: SessionRecord): Promise<void>
  getSession(id: string): Promise<SessionRecord | null>
  deleteSession(id: string): Promise<boolean>

  // --- Identity directory ---
  searchDirectory(query: string): Promise<DirectoryEntry[]>
  resolveIdentity(handle: string): Promise<OwnedEntry | null>
  putIdentity(entry: OwnedEntry): Promise<void>
  deleteIdentity(handle: string): Promise<boolean>
}
