# PRD-07 — Store Provider Spec & Reference Implementation

> **Phase:** **vNext (DEFERRED)** — NOT in v1. · **Status:** Draft (retained for the future addon)
> **Reframed by the serverless-v1 pivot (DECISIONS D-20, D-29) and the pluggable-store decision (D-30…D-33).**
>
> **What this PRD now is:** the **Store Provider Specification** — an *open HTTP contract* for an **optional, opt-in, zero-knowledge blob store** — plus a **reference implementation** hosted at `claudepad.io/store`. The store is a **spec, not a proprietary service** (Bitwarden / Headscale model): any org can implement it; trusting users can point at `claudepad.io/store`. It stores the opaque encrypted blobs from **PRD-11** (which are already client-side-encrypted) and serves them back by id — adding *convenience* (short URLs) and optional lifecycle, **never** changing the trust model.
>
> **v1 ships none of this.** v1 ships only the client seam — the `StoreProvider` interface + `NoStoreProvider` default — per **`../STORE-PROVIDER-SPEC.md`** (the design note). The v1 client contains **no provider implementation and no `claudepad.io/store` URL or store-specific code** (D-33). The endpoint/storage/lifecycle design below is the blueprint for the **reference implementation** when the addon is built; read it through that lens. The "envelope"/"link" references predate the pivot — substitute "the PRD-11 `cp-blob` (opaque ciphertext)" and note that fragment-link URLs are themselves vNext.
>
> Read `_context.md` and `../STORE-PROVIDER-SPEC.md` first.

---

## 1. Summary & problem

To share a session, the client (PRD-05) encrypts everything locally and must upload **opaque ciphertext** somewhere addressable by a short URL. PRD-07 is that "somewhere": a deliberately dumb, zero-knowledge **blob store with a tiny HTTP API** to create, fetch, and delete encrypted blobs plus their non-sensitive metadata (expiry, view count, burn-after-read, size). The server **never sees plaintext or keys** — keys live only in the URL fragment (`#…`), which browsers never transmit. The same minimal API must run unchanged on **Cloudflare Workers + R2 + D1/KV** (hosted `claudepad.io`) and on **Node/Hono + Postgres + S3-compatible** storage (self-host, PRD-09), via a thin storage-adapter interface. The design goal is: *small enough to audit in an afternoon, boring enough to trust.*

## 2. Goals / Non-goals

**Goals**
- A storage-agnostic REST/HTTP API: create, fetch, delete a blob + metadata.
- Server is a content-blind key/value store; it stores the PRD-05 ciphertext envelope verbatim.
- Enforce lifecycle controls server-side on **metadata only**: TTL/expiry and burn-after-read.
- A single `StorageAdapter` interface so one codebase targets Cloudflare and self-host without branching business logic.
- Abuse/DoS resilience: rate limiting, max blob size, request validation — without inspecting content.
- An abuse-reporting / takedown path that works even though the operator cannot read content.
- Observability (metrics, structured logs) that **never logs ciphertext, keys, IDs in a re-identifiable way, or anything from the fragment**.
- ID/URL scheme coordinated with PRD-05 (`/s/<id>`).

**Non-goals**
- Any decryption, parsing, secret scanning, or rendering server-side (all client-side; `_context.md` §5.1, §5.5).
- Accounts, auth, sessions, billing, dashboards (link-first; vNext per ROADMAP §5).
- Server-side full-text search or convenience/non-ZK mode (`_context.md` §5.5 — out of scope).
- Named-recipient / wrapped-key storage (vNext, `_context.md` §5.8). The schema must *not preclude* it (FR-23) but it does not ship.
- Defining the envelope's internal structure — that is **PRD-05's** contract; the server treats it as an opaque byte string.

## 3. Personas & user stories

- **As a Sharer**, I want my encrypted blob uploaded and to get back a short `id`, so the client can build `…/s/<id>#<key>`.
- **As a Low/High-priv viewer**, I want to fetch the ciphertext by `id` so my browser can decrypt it locally; I should never need an account.
- **As a Sharer**, I want to set a TTL and/or "burn after read" so the artifact disappears on schedule or after one view.
- **As a Self-hoster**, I want the identical API on `docker compose up` with no third-party dependency and no security penalty (ROADMAP §2.5).
- **As an Operator**, I want to honor a legal takedown by `id` even though I cannot read the content, and I want metrics/logs that don't compromise the zero-knowledge promise.
- **As an Attacker**, I should be unable to cheaply exhaust storage, enumerate IDs, or read anyone's plaintext from the server — by design.

## 4. UX & flows

The backend has **no UI** of its own (the operator console and abuse form are minimal, PRD-09 owns their styling). Flows are API-level.

**Publish (client → server):**
```
PRD-05 client                         PRD-07 server
─────────────                         ─────────────
encrypt body + secret map locally
build opaque envelope bytes  ──POST /v1/blobs──▶  validate size/rate
                                                  generate id
                                                  store ciphertext (R2/S3)
                                                  store metadata (D1/KV/PG)
            ◀── 201 { id, expiresAt, … } ─────
build URL: …/s/<id>#<K_body>[.<K_secret>]   (fragment never sent — §5.1)
```

**View (viewer → server):**
```
GET /s/<id>            (HTML app shell; key is in #fragment, server never sees it)
   └─ client JS ──GET /v1/blobs/<id>──▶  load metadata
                                          if expired → 410 + delete (lazy)
                                          if burn → return body, then delete
                     ◀── 200 envelope bytes (+ headers) ──
   └─ decrypt locally with fragment key
```

**Burn-after-read race (sketch):** the read path does a *fetch-then-delete*. Two concurrent reads on a burn blob can both observe the body once; we make delete idempotent and document the at-most-... caveat (FR-13–FR-15).

## 5. Functional requirements

### Blob create
- **FR-1** `POST /v1/blobs` accepts a request whose **body is the raw ciphertext envelope** (`application/octet-stream`) produced by PRD-05. The server MUST NOT parse, inspect, or transform the body.
- **FR-2** Lifecycle/metadata parameters (TTL, burn flag, optional client-asserted size) are passed via **HTTP headers or query params**, never inside the opaque body. Supported: `Cp-Expires-In` (seconds), `Cp-Burn-After-Read` (`true|false`). Defaults: **TTL = 7 days** (`DEFAULT_TTL = 604800`s; reconciled with PRD-05 §6.6 / D-14), burn = false. `DEFAULT_TTL` is config-driven (FR-26).
- **FR-3** On success the server generates an `id` (FR-19), persists ciphertext + metadata atomically-enough (FR-20), and returns `201` with `{ id, createdAt, expiresAt, burnAfterRead, size }` (no secret-bearing fields exist to leak).
- **FR-4** The server MUST reject bodies larger than `MAX_BLOB_SIZE` (default **5 MiB**, configurable) with `413 Payload Too Large`, ideally **streaming-rejected** before fully buffering.
- **FR-5** `Cp-Expires-In` MUST be clamped to `[MIN_TTL, MAX_TTL]` (defaults 60 s … 365 days); out-of-range → `400`. A value of `0`/omitted uses the default TTL. "Never expire" is **not** offered in v1 (bounded storage).
- **FR-6** The server MUST NOT require any auth to create a blob in the default (public hosted) config, but MUST support an optional `REQUIRE_UPLOAD_TOKEN` mode (shared secret via `Authorization: Bearer`) for locked-down self-hosts.

### Blob fetch
- **FR-7** `GET /v1/blobs/<id>` returns `200` with the exact stored ciphertext bytes (`application/octet-stream`) and metadata echoed in response headers (`Cp-Expires-At`, `Cp-Burn-After-Read`, `Cp-Created-At`, `Cp-View-Count`, `Content-Length`).
- **FR-8** `GET /v1/blobs/<id>/meta` returns metadata only (JSON, no body) so the client can decide UX (e.g. "this will burn on view") *before* triggering a burn. Calling `/meta` MUST NOT increment view count or trigger burn.
- **FR-9** Unknown `id` → `404`. Expired or already-burned `id` → `410 Gone` (distinct from 404 so the client can show "this link has expired/been viewed" rather than "wrong link"). The body of 404/410 MUST NOT reveal which case for *non-existent vs. previously-existed* beyond the 404/410 split — i.e. we accept a small enumeration signal (410) in exchange for honest UX; see §8.
- **FR-10** Each successful body fetch increments `viewCount`. View count is best-effort (eventually consistent under KV); exactness is not guaranteed and is documented.
- **FR-11** Conditional fetch via `If-None-Match`/`ETag` (ETag = a non-reversible content hash, e.g. truncated SHA-256 of ciphertext) MAY be supported for caching; ETag MUST NOT leak plaintext (ciphertext hash is safe).

### Lifecycle enforcement
- **FR-12** **Expiry** is enforced server-side on metadata. A blob whose `expiresAt < now` MUST be treated as `410 Gone` on fetch and SHOULD be deleted lazily on access and proactively by a sweeper (FR-16). Content stays encrypted regardless (`SECURITY-MODEL.md` §"Lifecycle controls").
- **FR-13** **Burn-after-read**: a blob with `burnAfterRead = true` MUST be deleted after the **first successful body fetch** via `GET /v1/blobs/<id>` (not `/meta`).
- **FR-14** The burn read path MUST perform a **conditional/atomic claim** so that at most one fetch is served the body when possible: e.g. an atomic `UPDATE … SET burned = 1 WHERE id = ? AND burned = 0` (D1/Postgres) gating whether this request is allowed to read+serve. The winning request serves the body and schedules ciphertext deletion; losers get `410`.
- **FR-15** Where the storage backend cannot guarantee a single-winner claim (e.g. KV's eventual consistency), the server MUST document the **at-most-but-not-exactly-once** caveat (a brief race window may serve the body to ≤ N concurrent readers) and still delete promptly. This is an honest-limits item, surfaced in docs (§8, §11).
- **FR-16** A **sweeper** (scheduled job: Cloudflare Cron Trigger / a Node interval) MUST periodically delete expired blobs' ciphertext + metadata so storage is bounded even if a blob is never fetched. Deletion MUST be idempotent.
- **FR-17** `DELETE /v1/blobs/<id>` allows explicit deletion. In the default config this requires a **delete capability**: at create time the server returns a one-way-hashed `deleteToken` association; the caller proves possession of the token. (Rationale §8: without it, anyone who knows an `id` could delete others' blobs.) `DELETE` is idempotent: deleting an absent/expired blob returns `204`.

### IDs & integrity
- **FR-18** Ciphertext and metadata MUST be stored such that the server can return bytes **byte-identical** to what was uploaded (no re-encoding, no normalization).
- **FR-19** `id` MUST be a URL-safe, unguessable, collision-resistant token: **≥ 128 bits of entropy**, base62/base64url, ~22 chars. IDs are generated server-side with a CSPRNG. The `/s/<id>` path (FR-25) uses the same `id`.
- **FR-20** Create MUST avoid orphaned state: write ciphertext to object storage first, then metadata; on metadata-write failure, best-effort delete the orphaned object (or let the sweeper GC objects with no metadata row). A blob is only "live" once its metadata row exists.

### Abuse, limits, multi-backend
- **FR-21** The API MUST enforce **rate limits** keyed on client IP (and, where available, a coarse network/ASN bucket) for create/fetch/delete, returning `429` with `Retry-After`. Limits are config-driven (FR-26). On Cloudflare, use the native **Rate Limiting binding** + WAF; on self-host, an in-adapter token-bucket/leaky-bucket.
- **FR-22** A global/operator-configurable **storage quota** and per-IP create quota MUST be enforceable to bound DoS-by-upload; exceeding returns `429`/`507 Insufficient Storage`.
- **FR-23** The metadata schema MUST be **forward-compatible** with vNext named-recipient mode (`_context.md` §5.8): reserve nullable columns/fields for wrapped-key references without using them in v1. No v1 code path reads/writes them.
- **FR-24** The **exact same route handlers and business logic** MUST run on both deployment targets; only the injected `StorageAdapter` (and a rate-limit adapter) differ (§6, §7.4).

### URL scheme & observability
- **FR-25** `GET /s/<id>` serves the **client app shell** (static HTML/JS), NOT the ciphertext. The fragment key never reaches the server. Bare `id` validation here MUST NOT trigger a metadata lookup that burns/expires (it just serves the SPA; the SPA then calls `/v1/blobs/...`).
- **FR-26** All limits/TTLs/sizes/tokens MUST be configurable via env (`MAX_BLOB_SIZE`, `MIN_TTL`, `MAX_TTL`, `DEFAULT_TTL`, `RATE_LIMIT_*`, `REQUIRE_UPLOAD_TOKEN`, `STORAGE_QUOTA_BYTES`) — PRD-09 owns the reference.
- **FR-27** Logs/metrics MUST be **content-blind**: never log the request/response body, the `id` in full at info level (log a salted hash or truncated prefix), headers that could carry keys, query strings, or `Referer`. Emit only: counts, sizes, status codes, latency, coarse error class, backend name. (§8)
- **FR-28** The server MUST expose `GET /healthz` (liveness) and `GET /readyz` (storage reachable) returning no sensitive data, for PRD-09's deploy/monitoring.
- **FR-29** `POST /v1/abuse-reports` accepts an abuse/takedown report referencing a `<id>` (+ reporter contact, reason). It MUST NOT require the operator to read content; it records the report and (per operator policy) can quarantine/delete the blob by `id` (§8). Reports are rate-limited.

## 6. Technical design

**Shape.** A single tiny Hono app. Hono runs natively on Cloudflare Workers and on Node (`@hono/node-server`), giving us **one router, one set of handlers** across both targets — the central reason it's chosen here. Business logic depends only on injected adapters, never on platform globals.

```
            ┌────────────────────────── Hono app (shared) ──────────────────────────┐
            │  routes: /v1/blobs (POST,GET,DELETE), /v1/blobs/:id/meta,             │
request ──▶ │          /v1/abuse-reports, /s/:id, /healthz, /readyz                 │
            │  middleware: rate-limit · body-size guard · request-id · validation   │
            │  handlers ── call ──▶ BlobService (lifecycle, burn claim, sweeper)    │
            └──────────────────────────────┬────────────────────────────────────────┘
                                           │ depends on
                          ┌────────────────┴───────────────┐
                          ▼                                 ▼
                   StorageAdapter                    RateLimitAdapter
              (objects + metadata)                  (per-IP buckets)
        ┌──────────────┴───────────────┐
        ▼                              ▼
  Cloudflare adapter             Node/self-host adapter
   R2 (ciphertext)               S3-compatible (ciphertext)
   D1 (metadata, default)        Postgres (metadata)
   KV (optional fast-path)       in-proc token bucket
   RateLimit binding / WAF
```

**Why split ciphertext (object store) from metadata (DB)?** Object stores (R2/S3) are cheap, durable, and built for opaque blobs but weak at conditional/atomic ops and queries (expiry sweeps, burn claims, counters). A small relational/KV layer (D1/Postgres/KV) gives us atomic burn claims (FR-14), TTL queries (FR-16), and counters (FR-10). Both metadata stores stay tiny (one row per blob).

**Metadata store choice (hosted).** Default to **D1** because it supports the atomic conditional `UPDATE` we need for a clean single-winner burn (FR-14) and `WHERE expiresAt < now` sweeps (FR-16). KV is offered as an optional accelerator/alternative but its eventual consistency weakens burn guarantees (FR-15). Self-host uses **Postgres** with the same SQL semantics.

**Size & platform limits (grounded).** Cloudflare Workers request bodies are capped at 100 MB (Free/Pro); R2 objects up to ~5 GiB; D1 row/BLOB up to 2 MB; KV value up to 25 MB. Our `MAX_BLOB_SIZE` default of **5 MiB** sits comfortably under all of these and is plenty for a redacted transcript + secret-map envelope; ciphertext is stored in R2/S3 (not in the DB row), so the D1 2 MB row limit doesn't constrain blob size. Streaming size-rejection (FR-4) avoids buffering hostile uploads.

**Concurrency / burn (FR-14).** Burn is implemented as a DB-gated claim, not an object-store operation:
```sql
UPDATE blobs SET burned = 1, viewCount = viewCount + 1
 WHERE id = ?1 AND burned = 0 AND (expiresAt IS NULL OR expiresAt > ?now);
-- rows-affected == 1  → this request is the winner: serve body, then delete ciphertext
-- rows-affected == 0  → already burned/expired: return 410
```
The ciphertext object is deleted after the body is streamed (or scheduled via `ctx.waitUntil` on Workers). If body streaming fails mid-flight, the row is already burned — we accept "burned but client didn't fully receive" as the safe failure (a burn link is single-use by contract; the user can't retry, which is the intended semantics; surfaced in §8/§11).

**Idempotency caveat.** Because burn mutates state, `GET` on a burn blob is **not idempotent/safe** in the strict HTTP sense. We mitigate: (a) `/meta` is the safe read for pre-flight UX (FR-8); (b) clients are instructed (PRD-05) not to auto-retry a burn `GET`; (c) caches/prefetchers are defeated with `Cache-Control: no-store, private` and a `Cp-Single-Use: 1` hint header so well-behaved intermediaries don't pre-fetch and accidentally burn the link.

**Sweeper.** Cloudflare **Cron Trigger** invokes a scheduled handler that runs `DELETE FROM blobs WHERE expiresAt < now` in batches and deletes the corresponding R2 objects; self-host runs the same routine on a `setInterval`/cron. Object-store lifecycle rules (R2/S3 TTL) are a defense-in-depth backstop, not the primary mechanism (TTL is per-blob and dynamic).

**Trade-offs.**
- *Atomic burn vs. KV simplicity* → choose D1/Postgres for correctness; document KV's weaker guarantee.
- *Two stores vs. one* → slightly more moving parts, but each store does what it's good at and stays auditable.
- *No "never expire"* → bounds storage and abuse; an honest limit.
- *Delete-token vs. open delete* → a tiny amount of client bookkeeping buys protection against `id`-knowing griefers.

## 7. Data model / API

### 7.1 API surface

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/v1/blobs` | Create blob; body = opaque ciphertext envelope (PRD-05) | None (optional upload token) |
| `GET` | `/v1/blobs/:id` | Fetch ciphertext bytes; increments view; may burn | None |
| `GET` | `/v1/blobs/:id/meta` | Fetch metadata only; **never** burns/increments | None |
| `DELETE` | `/v1/blobs/:id` | Explicit delete; requires `deleteToken` (idempotent) | Delete capability |
| `GET` | `/s/:id` | Serve client app shell (key stays in `#fragment`) | None |
| `POST` | `/v1/abuse-reports` | File a takedown/abuse report by `id` | None (rate-limited) |
| `GET` | `/healthz` | Liveness | None |
| `GET` | `/readyz` | Readiness (storage reachable) | None |

### 7.2 Request / response schemas

**Create — `POST /v1/blobs`**
- Headers: `Content-Type: application/octet-stream`, `Cp-Expires-In: <seconds>` (optional), `Cp-Burn-After-Read: true|false` (optional), `Authorization: Bearer <token>` (only if `REQUIRE_UPLOAD_TOKEN`).
- Body: raw ciphertext bytes (opaque).

`201 Created`:
```json
{
  "id": "9bH2qV7tXz0aK4mLpR1sWd",
  "createdAt": "2026-06-20T12:00:00Z",
  "expiresAt": "2026-07-20T12:00:00Z",
  "burnAfterRead": false,
  "size": 48213,
  "deleteToken": "td_3f8c…",          // shown once; client stores if it wants delete capability
  "url": "/s/9bH2qV7tXz0aK4mLpR1sWd"  // path only; client appends #key
}
```
Errors: `400` (bad TTL/headers), `401` (upload token required/invalid), `413` (too large), `429` (rate/quota), `507` (storage full).

**Fetch — `GET /v1/blobs/:id`**
`200 OK`, body = ciphertext bytes. Headers:
```
Content-Type: application/octet-stream
Content-Length: 48213
Cp-Created-At: 2026-06-20T12:00:00Z
Cp-Expires-At: 2026-07-20T12:00:00Z
Cp-Burn-After-Read: false
Cp-View-Count: 3
Cache-Control: no-store, private
ETag: "a1b2c3d4"            // truncated SHA-256 of ciphertext (non-reversible)
```
Errors: `404` (no such id), `410` (expired or burned), `429`.

**Meta — `GET /v1/blobs/:id/meta`** → `200`:
```json
{
  "id": "9bH2qV7tXz0aK4mLpR1sWd",
  "createdAt": "2026-06-20T12:00:00Z",
  "expiresAt": "2026-07-20T12:00:00Z",
  "burnAfterRead": false,
  "size": 48213,
  "viewCount": 3
}
```

**Delete — `DELETE /v1/blobs/:id`** with header `Cp-Delete-Token: td_3f8c…` → `204 No Content` (idempotent). `403` if token missing/wrong, `204` if already gone.

**Abuse report — `POST /v1/abuse-reports`**:
```json
{ "blobId": "9bH2qV7tXz0aK4mLpR1sWd", "reason": "phishing", "reporterContact": "a@b.com", "notes": "…" }
```
→ `202 Accepted` `{ "reportId": "ar_…" }`. The operator never needs to decrypt to act (§8).

**Error envelope (all errors):**
```json
{ "error": { "code": "BLOB_TOO_LARGE", "message": "Body exceeds 5 MiB limit." } }
```
`code` is a stable machine string; `message` never echoes body/key/header content.

### 7.3 Metadata DB schema (D1 / Postgres — identical semantics)

```sql
CREATE TABLE blobs (
  id              TEXT PRIMARY KEY,          -- 128-bit base62 (FR-19)
  size            INTEGER NOT NULL,          -- ciphertext byte length
  created_at      INTEGER NOT NULL,          -- epoch ms
  expires_at      INTEGER,                   -- epoch ms; NULL not used in v1 (TTL always set)
  burn_after_read INTEGER NOT NULL DEFAULT 0,-- 0|1
  burned          INTEGER NOT NULL DEFAULT 0,-- 0|1 single-winner flag (FR-14)
  view_count      INTEGER NOT NULL DEFAULT 0,
  delete_token_hash TEXT,                    -- SHA-256(deleteToken); NULL = no delete capability
  storage_key     TEXT NOT NULL,             -- opaque object-store key for the ciphertext
  -- vNext reservation (FR-23): unused in v1, never read/written by v1 code
  recipient_keyset_ref TEXT                   -- nullable; future wrapped-key pointer
);
CREATE INDEX idx_blobs_expires ON blobs (expires_at);   -- sweeper (FR-16)

CREATE TABLE abuse_reports (
  id          TEXT PRIMARY KEY,
  blob_id     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  contact     TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'   -- open|actioned|dismissed
);
```
No column stores plaintext, a key, or anything derived from the fragment. `storage_key` is an internal opaque handle, not user-facing.

### 7.4 Storage-adapter interface (TypeScript — shared types package)

```ts
/** Opaque ciphertext envelope from PRD-05; the server never interprets it. */
export type Ciphertext = Uint8Array | ReadableStream<Uint8Array>;

export interface BlobMetadata {
  id: string;
  size: number;
  createdAt: number;        // epoch ms
  expiresAt: number;        // epoch ms (always set in v1)
  burnAfterRead: boolean;
  burned: boolean;
  viewCount: number;
  deleteTokenHash: string | null;
  storageKey: string;
}

/** Single seam both deployments implement; business logic depends only on this. */
export interface StorageAdapter {
  /** Persist ciphertext object then metadata row. Returns the live metadata.
   *  Must avoid orphaned state (FR-20). */
  put(meta: Omit<BlobMetadata, "burned" | "viewCount">, body: Ciphertext): Promise<BlobMetadata>;

  /** Metadata only — never mutates state (powers /meta, FR-8). */
  getMeta(id: string): Promise<BlobMetadata | null>;

  /** Read the ciphertext object bytes/stream. */
  getBody(storageKey: string): Promise<Ciphertext | null>;

  /** Atomic single-winner read claim for a fetch (FR-10/FR-14).
   *  Increments viewCount; if burnAfterRead, atomically sets burned.
   *  Returns the post-claim metadata, or { gone: true } if expired/already-burned. */
  claimRead(id: string, now: number): Promise<{ meta: BlobMetadata } | { gone: true }>;

  /** Idempotent delete of metadata + ciphertext object (FR-16/FR-17). */
  delete(id: string): Promise<void>;

  /** Batch GC of expired rows + their objects; returns count deleted (FR-16). */
  sweepExpired(now: number, limit: number): Promise<number>;

  /** Storage reachable? (readyz, FR-28) */
  ping(): Promise<boolean>;

  // vNext (FR-23): intentionally absent in v1.
}

export interface RateLimitAdapter {
  /** Returns allow=false with retryAfterMs when over limit (FR-21). */
  check(key: string, op: "create" | "fetch" | "delete" | "report"): Promise<{
    allow: boolean; retryAfterMs?: number;
  }>;
}

export interface AbuseStore {
  fileReport(r: { blobId: string; reason: string; contact?: string; notes?: string }): Promise<string>;
}
```
- **Cloudflare adapter:** `put`/`getBody` → R2; `getMeta`/`claimRead`/`delete`/`sweepExpired` → D1 (SQL above); `RateLimitAdapter` → native Rate Limiting binding + WAF.
- **Self-host adapter:** R2→S3-compatible (`@aws-sdk/client-s3` / MinIO), D1→Postgres (same SQL), rate-limit → in-process token bucket. Wired by PRD-09's `docker compose`.

### 7.5 ID & URL scheme (coordinated with PRD-05)
- `id` = 22-char base62, ≥128-bit CSPRNG (FR-19). Share URL (PRD-05 builds): `https://<host>/s/<id>#<K_body>[.<K_secret>]`. The server only ever sees the path; the `#`-fragment (the key material) is never transmitted (`SECURITY-MODEL.md` §"Layer 1"). `/s/:id` serves the SPA (FR-25); the SPA fetches `/v1/blobs/:id`.

## 8. Security & privacy

Conforms to `_context.md` §5 / `SECURITY-MODEL.md`:
- **Zero-knowledge (§5.1):** the body is opaque ciphertext; no endpoint, log, or metric ever sees plaintext or keys. Keys travel only in the fragment, which never reaches the server. The server stores `{id → ciphertext + metadata}` and "nothing else sensitive." **PRD-07 conforms; it does not weaken the model.**
- **Lifecycle (§5.6):** TTL and burn enforced on metadata only; ciphertext is never decrypted to enforce them (FR-12–FR-16).
- **Content-blind observability (FR-27):** no body, no full `id` at info level (salted-hash/prefix only), no key-bearing headers, no query strings, no `Referer`, no fragment (the server can't see it anyway, but we don't log paths in a way that could correlate). Metrics = counts/sizes/status/latency/backend name. This directly protects the §5.7 metadata-leak surface from being *amplified* by our own logs.
- **Acknowledged metadata leakage (§5.7, in-scope-honest):** the server still learns blob **size, timing, access counts, IP**. We minimize (short log retention, IP not persisted with `id`, optional IP hashing) but cannot eliminate — documented, not buried.
- **Enumeration:** 128-bit IDs make guessing infeasible. The `404` vs `410` split gives a tiny "this id once existed" oracle for an attacker who already holds a valid id; we accept it for honest UX and note it. No listing endpoint exists.
- **DoS / abuse:** `MAX_BLOB_SIZE` + streaming rejection (FR-4), per-IP + global rate limits and quotas (FR-21/FR-22), bounded TTL (FR-5), sweeper (FR-16). Cloudflare WAF/Rate-Limiting binding fronts the hosted instance.
- **Delete authorization (FR-17):** delete requires a capability token; knowing an `id` (which is the public address) must not grant delete. Token is stored only as `SHA-256` hash.
- **Burn race & idempotency (§4, §6):** single-winner DB claim where possible (FR-14); honest "≤ N readers in a race / may burn without full receipt" caveat where not (FR-15). `GET` on a burn blob is non-idempotent by nature — mitigated with `no-store`, a single-use hint header, and the safe `/meta` pre-flight.
- **Abuse reporting / takedown without reading content (FR-29):** because the operator *cannot* read content, takedown is necessarily **identifier-based** (report cites an `id` + out-of-band evidence such as the shared link or a screenshot the reporter provides). The operator can quarantine/delete by `id` without decrypting. This preserves zero-knowledge while giving a real-world removal path — and is itself a feature of the model (the host can comply with a valid legal order by deleting opaque bytes, never by surveilling users).
- **Risks introduced by this PRD:** (a) an operator-controlled metadata DB is a new juicy target — but it holds no secrets, only timing/size/counters; (b) the upload endpoint is an abuse vector for storing arbitrary ciphertext (e.g. illegal material as opaque bytes) — mitigated only by takedown (FR-29) + quotas, an inherent property of any ZK blob store, documented for operators in PRD-09.

## 9. Dependencies

**Upstream**
- **PRD-05 (Crypto Core):** owns and defines the **envelope wire format** stored by this API; agrees the `/s/<id>#<key>` URL scheme and `id` shape (§7.5). PRD-07 treats the envelope as opaque.
- **`_context.md` §3/§5, `SECURITY-MODEL.md`:** tech stack and the security model this conforms to.

**Downstream**
- **PRD-09 (Self-Hosting & Launch):** wires the self-host `StorageAdapter` (Postgres + S3/MinIO) into `docker compose`, owns the config/env reference (FR-26), deploys the Cloudflare target, and publishes the operator abuse/takedown policy. Runs the security review gating the API.
- **PRD-03/PRD-08 (Viewer/Playback):** consume the fetched ciphertext (after client-side decrypt) but do not call the API directly beyond `/v1/blobs/:id`.

## 10. Acceptance criteria / DoD

- [ ] All eight endpoints (§7.1) implemented in one Hono app, running unchanged on Cloudflare Workers and Node, selected only by injected adapter (FR-24).
- [ ] `POST /v1/blobs` stores opaque bytes byte-identically and returns `201` with `{id, createdAt, expiresAt, burnAfterRead, size, deleteToken, url}` (FR-1–FR-3, FR-18).
- [ ] Bodies > `MAX_BLOB_SIZE` rejected `413` without full buffering (FR-4); TTL clamped, bad TTL → `400` (FR-5).
- [ ] `GET /v1/blobs/:id` returns exact bytes + metadata headers; unknown → `404`, expired/burned → `410` (FR-7, FR-9).
- [ ] `GET …/meta` returns metadata without incrementing view or burning (FR-8) — verified by test.
- [ ] Burn: concurrent fetch test shows single-winner via atomic claim on D1/Postgres; KV caveat documented (FR-13–FR-15).
- [ ] Expiry enforced lazily on fetch **and** by sweeper; sweeper deletes object + row idempotently (FR-12, FR-16).
- [ ] `DELETE` requires valid `deleteToken`, is idempotent, returns `204` (FR-17).
- [ ] Rate limits + size + quota return `429`/`413`/`507` with `Retry-After` where applicable (FR-21, FR-22).
- [ ] `id` is ≥128-bit CSPRNG base62; collision/guess tests pass (FR-19).
- [ ] Log/metric audit: no body, key, full-`id`, query, or `Referer` in any log line (FR-27) — verified by a grep/assert in tests.
- [ ] `/s/:id` serves the SPA without touching blob metadata (FR-25); `/healthz`/`/readyz` work (FR-28).
- [ ] `POST /v1/abuse-reports` records a report and supports operator delete-by-id (FR-29).
- [ ] vNext columns present but unread by v1 code (FR-23).
- [ ] `StorageAdapter` + `RateLimitAdapter` interfaces (§7.4) implemented for both backends with a shared conformance test suite.
- [ ] **ZK verification test:** a captured `POST` + stored object contain no recoverable plaintext (ROADMAP §6 metric) — full ciphertext round-trips byte-identically and nothing else is persisted.

## 11. Open questions

- **OQ-1 (delete token):** Is a returned `deleteToken` worth the client bookkeeping, or should v1 ship with **no client-initiated delete** (rely on TTL + burn + operator takedown only)? Leaning "include it, optional" — flagged for PRD-05 alignment since the client must store it.
- **OQ-2 (404 vs 410 oracle):** Accept the small "id once existed" enumeration signal of `410`, or collapse expired/burned/absent all to `404` for stricter indistinguishability at the cost of worse UX? Current lean: keep `410` for honesty; revisit in security review (PRD-09).
- **OQ-3 (burn under KV):** Do we forbid KV for burn-after-read blobs entirely (force D1/Postgres for those) to guarantee single-winner, or allow it with the documented caveat (FR-15)? Affects self-host minimalism.
- **OQ-4 (view-count exactness):** Is best-effort `viewCount` acceptable for v1, or does any UX (PRD-05) depend on exactness? If exact, KV is unsuitable for counters.
- **OQ-5 (IP retention for rate-limit/abuse):** How long, and hashed vs. raw? Tension between abuse mitigation and the §5.7 IP-metadata leak. Needs an operator-configurable, privacy-default answer in PRD-09.
- **OQ-6 (CORS):** The API is same-origin with the SPA in the default deploy, but a self-hoster may split origins. Define a configurable CORS allowlist (default: same-origin only) — confirm with PRD-09.
- **OQ-7 (abuse evidence):** Since the operator can't read content, what minimum evidence must a report carry to be actionable (the share link incl. fragment? a screenshot?) without the operator becoming a deanonymizer? Policy decision shared with PRD-09.
- **OQ-8 (compression/format negotiation):** Should the server advertise a max-size and accepted content encodings so PRD-05 can decide client-side compression-before-encryption, or is that purely a client concern? Likely client-only; confirm with PRD-05.

## 12. Phase / milestone

**Phase P2 — Hosted Sharing** (ROADMAP §3), alongside **PRD-05**. Build order: **PRD-07 precedes PRD-05** in the critical path (PRD-01→02→03→04→**07**→05→06→08→09) so the storage target exists before the client's share flow is wired against it. Self-host parity (this PRD's `StorageAdapter`) is consumed at **P5/PRD-09**.
