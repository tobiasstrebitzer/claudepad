/**
 * Availability axis - the zero-knowledge blob-store seam (STORE-PROVIDER-SPEC.md).
 *
 * A store only ever transports opaque, already-encrypted bytes. It never sees
 * plaintext or keys, so any third party can host it without being trusted.
 */

export interface StoreCapabilities {
  /** Server-side expiry/TTL on stored blobs. */
  expiry: boolean;
  /** Delete-on-first-read. */
  burnAfterRead: boolean;
  /** Caller-initiated delete by id. */
  delete: boolean;
  /** Max accepted blob size in bytes, if the store advertises one. */
  maxBytes?: number;
}

export interface StorePutOptions {
  expiresInSeconds?: number;
  burnAfterRead?: boolean;
}

/** An addressable reference to stored bytes: an id plus an optional short URL. */
export interface StoredRef {
  id: string;
  url?: string;
}

/** What a client can ask of a store. Implemented by addons; never by the v1 core. */
export interface StoreProvider {
  /** Stable identifier, e.g. "claudepad.io/registry" or "acme-internal". */
  readonly id: string;
  /** MUST be https:// (or http://localhost for dev) - see guards.ts. */
  readonly baseUrl: string;
  /** Upload opaque, already-encrypted bytes; returns an addressable id (+ optional short URL). */
  put(blob: Uint8Array, opts?: StorePutOptions): Promise<StoredRef>;
  /** Fetch opaque bytes by id. */
  get(id: string): Promise<Uint8Array>;
  readonly capabilities: StoreCapabilities;
}

/** v1 default: there is no store. Sharing stays purely client-side. */
export const NoStoreProvider: StoreProvider | null = null;
