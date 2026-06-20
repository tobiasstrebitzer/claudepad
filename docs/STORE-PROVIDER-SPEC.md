# claudepad - Store Provider Spec (design note)

> **Status:** design note for v1; full spec + reference implementation are **vNext** (PRD-07). **v1 ships the seam, not the store.**
> **Principle:** the store is an **open contract, not a proprietary service** (DECISIONS D-30…D-33). Like Bitwarden (point your client at any server URL) or Tailscale↔Headscale (open protocol, reference control server), `claudepad.io/store` is *one* free, open-source reference implementation - anyone can run their own.

## Why this note exists

v1 is **entirely client-side** and launches with **zero store dependency**. But we want to be sure that adding an optional store later is a clean drop-in, not a re-architecture. This note pins the integration seam so the v1 bundle stays pure while leaving the door open.

## The principle

1. **Spec, not service.** What we publish is an HTTP contract for a **zero-knowledge blob store**: it accepts opaque ciphertext (the PRD-11 `cp-blob`) and serves it back by id. It never sees plaintext or keys.
2. **Opt-in, pluggable.** Default is **no store** - sharing is carry-the-blob (clipboard/file). A user may *optionally* configure a store by URL: their self-host, their org's, or `claudepad.io/store`. The benefit a store adds is **convenience** (a short URL instead of a big blob) and, later, optional lifecycle - never a change to the trust model (blobs are already encrypted client-side).
3. **No lock-in, no special-casing.** The v1 client contains **no store implementation and no `claudepad.io/store` URL or store-specific code**. The store URL is plain config with an empty default.

## The seam (what v1 actually ships)

A single interface and a null default. Nothing else store-related ships in v1.

```ts
/** What the client can ask of a store. Implemented by addons; never by v1 core. */
export interface StoreProvider {
  readonly id: string;                 // e.g. "claudepad.io/store", "acme-internal"
  readonly baseUrl: string;
  /** Upload an opaque, already-encrypted blob; returns an addressable id (+ optional short URL). */
  put(blob: Uint8Array, opts?: StorePutOptions): Promise<{ id: string; url?: string }>;
  /** Fetch opaque bytes by id. */
  get(id: string): Promise<Uint8Array>;
  /** Optional capabilities the UI can feature-detect (expiry, burn, delete…). */
  readonly capabilities: StoreCapabilities;
}

export type StorePutOptions = { expiresInSeconds?: number; burnAfterRead?: boolean };
export type StoreCapabilities = { expiry: boolean; burnAfterRead: boolean; delete: boolean; maxBytes?: number };

/** v1 default: there is no store. Sharing stays purely client-side. */
export const NoStoreProvider: StoreProvider | null = null;
```

- The share flow (PRD-11) checks: **if a `StoreProvider` is configured**, offer "also get a short link"; **otherwise** (the v1 default) just produce the blob. The crypto is identical either way - a store only *transports* the ciphertext.
- Provider selection is **runtime/build config** (`STORE_URL`, default empty). The core imports the *interface*, never a concrete provider.
- Because the blob is encrypted before it ever reaches a provider, a store is **zero-knowledge by construction** - exactly the property that lets any third party (or `claudepad.io/store`) host it without being trusted.

## What's deferred to the full spec (vNext, PRD-07)

The complete contract and the reference implementation: concrete HTTP endpoints (create/fetch/meta/delete), id scheme, metadata (expiry/burn/view-count), rate limiting, abuse/takedown by id (the operator can act without reading content), storage adapters (Cloudflare R2/D1, Node/Postgres/S3), and an OpenAPI document so implementations interoperate. `claudepad.io/store` is the canonical reference impl. Existing PRD-07 content is retained for that work.

## v1 guardrails (so we don't paint ourselves into a corner)

- ✅ Define `StoreProvider` + `NoStoreProvider` (above) in the shared types; **ship nothing else store-related.**
- ✅ PRD-11's blob format is already store-ready: it's self-contained opaque ciphertext; a store needs only to hand back the same bytes.
- ❌ **No** `claudepad.io/store` URL, branding, or store-specific logic in the v1 client (D-33).
- ❌ **No** assumption in PRD-03/04/05/06/10/11 that a store exists; all flows must work fully offline.
