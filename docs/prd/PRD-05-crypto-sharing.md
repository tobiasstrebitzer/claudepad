# PRD-05 - Crypto Core & Recipient Wrapping

> **Phase:** P0/P3 · **Status:** Draft · **Re-scoped by the serverless-v1 pivot (DECISIONS D-20…D-29).**
> **Canonical refs:** `../TRUSTLESS-MODEL.md` (the v1 design - conform exactly), `docs/SECURITY-MODEL.md` (threat-model framing), `_context.md` §3/§5, §7 (template). **Reference implementation:** `poc/` (`poc/verify.mjs` = 21-check anchor).
>
> **v1 scope of this PRD = the cryptographic core:** the WebCrypto primitives (AES-256-GCM, ECDH P-256, HKDF-SHA256, SHA-256), the **two independent content keys** (`K_body`/`K_secret`), the **ephemeral-ECDH recipient wrap** (sealed box), and the **fingerprint** primitive. It is consumed by **PRD-10** (identity) and **PRD-11** (the share/receive flow + blob format). **Deferred to vNext:** the **URL-fragment link grammar (§7.3)**, **lifecycle/expiry/burn (§6.6)**, and the **backend wire contract (§7.4)** - these belong to the optional store addon (PRD-07) and link mode, not v1. Where this document says "upload"/"server"/"link," read it as the vNext path; the v1 path is "wrap to recipient → blob" (PRD-11).

---

## 1. Summary & problem

claudepad's promise is that the host - including `claudepad.io` - **cannot read a shared session**, and that a sharer can **cryptographically** reveal or hide embedded secrets per recipient tier. This PRD specifies the crypto core that makes that an architectural property rather than a privacy policy: a client-side **AES-256-GCM** encryption scheme, a **two-key envelope** (`K_body` for the redacted transcript, `K_secret` for the secret map), **URL-fragment key transport**, and the publish/fetch flows. The server never receives a key or plaintext; access tier is decided purely by *which keys a link carries*. The format is versioned and deliberately leaves room for the vNext named-recipient (X25519) mode without re-architecture.

## 2. Goals / Non-goals

### Goals (v1)
- **G1.** Encrypt session content client-side with **AES-256-GCM** using the Web Crypto API (`crypto.subtle`) only; nothing leaves the device (no server).
- **G2.** Define the **two independent content keys** (`K_body` + `K_secret`) PRD-06 fills and the **ephemeral-ECDH recipient wrap** (§6.10) that protects them - the live v1 primitive consumed by PRD-11's `cp-blob`.
- **G6.** Specify **decrypt + verify** on the receive side, including tamper detection (GCM auth) and graceful, fail-closed failure when a blob isn't addressed to the current identity.
- **G7.** Enforce **key-handling hygiene**: keys in memory only, never logged, never transmitted.
- **G8.** Keep a clean seam so the *same* content keys can later be wrapped to recipients server-side (vNext store) - no change to the blob layout.
- **G9. Resolve Q-2**: independent keys vs. key hierarchy - recommend, with rationale (independent; D-13).
- **G10.** Provide the **fingerprint** primitive (SHA-256 over a public key → emoji+hex) for PRD-10/PRD-11 trust UX.

### Goals - vNext (deferred, link/store mode)
- **G3 (vNext).** URL-fragment key transport + link grammar (`#<K_body>[.<K_secret>]`) - only when the optional store/link mode ships (§7.3).
- **G4 (vNext).** Publish / link-generation flow + leakage warnings (§4.1).
- **G5 (vNext).** Expiry (TTL) + burn-after-read semantics (§6.6), enforced by the store (PRD-07).

### Non-goals
- **NG1.** Secret detection, the review-before-share UI, and secret-map construction - owned by **PRD-06**. This PRD only defines the *container* the secret map lives in and the keys that protect it.
- **NG2.** The HTTP API, storage backends, rate limiting, and server-side lifecycle enforcement - owned by **PRD-07**. This PRD defines the *wire format* (the blob + create/fetch request shapes) it agrees with PRD-07.
- **NG3.** Named-recipient / PGP-style sharing (X25519 wrapping, revocation, audit) - vNext. We design *not to preclude* it (§6.8) but do not implement it.
- **NG4.** Password-protected pastes (a human passphrase as the key source). v1 uses random keys; §6.7 notes how a passphrase could layer in later.
- **NG5.** Convenience / non-ZK mode (server-side processing). Out of scope for v1 per `_context.md` §5.5.
- **NG6.** The transcript rendering and inline placeholder UI - owned by PRD-03/PRD-06.

## 3. Personas & user stories

- **Sharer:** *As a developer who just finished a useful session, I want to encrypt it to my teammate's public key and get a blob I can paste into Slack, so that only they can read it without me leaking my tokens.*
- **Sharer (tiered):** *As a sharer, I want to grant a wide audience body-only and one trusted teammate body+secrets, so that only the teammate sees the real secret values - guaranteed by crypto (which content key I wrap), not by a flippable setting.*
- **Body-only recipient:** *As someone given a body-only blob, I want to see the full transcript with `[AWS_KEY ••••••••(20)]` placeholders, never the real secrets.*
- **Body+secrets recipient:** *As someone given a body+secrets blob, I want the same transcript with real secret values substituted back in.*
- **Auditor:** *As a security reviewer, I want one small, zero-dependency crypto module with documented, `poc/`-verified functions, so that I can audit the spine before v1 (gating per PRD-09).*
- *(vNext) Lifecycle/link personas (expiring links, hosted URLs) return with the optional store addon.*

## 4. UX & flows

> **v1 share/receive UX lives in [PRD-11](./PRD-11-trustless-sharing.md) §4** (encrypt-to-recipient → blob → decrypt). The publish/view flows below are the **vNext** link/store mode (hosted URLs, expiry/burn) and are retained for that future - they are **not** v1.

### 4.1 Publish flow - **vNext (link/store mode)** (entry from PRD-04 ingest / PRD-06 review)

```
Local session (PRD-02/03 normalized)
        │
        ▼
 [PRD-06] Review-before-share  ──►  { redactedSession, secretMap }
        │  (mandatory, load-bearing; never auto-publish)
        ▼
 Share dialog (this PRD owns the crypto controls):
   ┌──────────────────────────────────────────────┐
   │  Share this session                          │
   │                                              │
   │  Expiry:   ( ) 1 hour  (•) 7 days  ( ) 30d   │
   │  [ ] Burn after first read                   │
   │                                              │
   │  Secrets: 3 detected (reveal in high-priv)   │
   │                                              │
   │           [ Cancel ]   [ Encrypt & Publish ] │
   └──────────────────────────────────────────────┘
        │  Encrypt & Publish
        ▼
 Crypto core: generate K_body (+ K_secret if secrets present),
 encrypt both layers, assemble envelope  ──►  POST to PRD-07
        │
        ▼
 Server returns { id }   (never sees a key)
        │
        ▼
 Link result panel:
   ┌──────────────────────────────────────────────┐
   │  Published.                                  │
   │                                              │
   │  Low-privilege link (secrets hidden):        │
   │   https://claudepad.io/s/AbC123#K_body…  [⧉] │
   │                                              │
   │  High-privilege link (reveals secrets):      │
   │   …/s/AbC123#K_body….K_secret…           [⧉] │
   │   ⚠ Anyone with this link sees your secrets. │
   │                                              │
   │  ⚠ The link IS the key. We never get it.     │
   │    Don't paste it where you wouldn't paste   │
   │    the secret itself.                        │
   └──────────────────────────────────────────────┘
```

- If **no secrets** were detected/confirmed in PRD-06, only the low-priv (single-key) link is shown, and `K_secret` / the secret-map layer are omitted from the envelope entirely (`secret: null`). The high-priv affordance is hidden, not disabled.
- The high-priv link is **visually quarantined** (warning styling, separate copy button) so a sharer never copies it by reflex.

### 4.2 View flow (low-priv vs. high-priv)

```
User opens  …/s/<id>#<fragment>
        │
        ▼
 Parse fragment → { K_body, K_secret? }   (link grammar, §7.3)
        │
        ▼
 GET /s/<id>  (PRD-07) → envelope JSON (ciphertext + adata) | 404/410 (gone/expired)
        │
        ▼
 Decrypt body with K_body  ──► verify GCM tag
        │                         │ fail → "Link is broken or tampered" error
        ▼ ok
 Has K_secret AND envelope.secret present?
        ├─ no  → render transcript with placeholders            (low-priv view)
        └─ yes → decrypt secret map with K_secret → verify tag
                 → substitute real values into placeholders     (high-priv view)
```

- **Burn warning before fetch:** if the metadata (returned by the non-destructive `GET /v1/blobs/:id/meta`, PRD-07 FR-8) flags burn-after-read, show an interstitial - *"Opening this will permanently destroy it. Continue?"* - before the destroying `GET /v1/blobs/:id`, so a link preview/prefetch doesn't silently burn the paste (§6.6, mitigates the prefetch race).
- **Expired/gone:** a friendly 410 state - *"This session has expired or was burned."* No retry that could leak the fragment to logs.

### 4.3 Fragment hygiene on load (UX)
- After successfully reading the fragment, the client **strips it from the visible address bar** via `history.replaceState` (keeps the in-memory keys; removes the credential from the bar, screen-shares, and shoulder-surfers). See FR-21.
- A persistent, dismissible banner on shared views: *"You're viewing a private session. The decryption key was in the link, not on our server."*

## 5. Functional requirements

Numbered, testable. **MUST** unless stated.

> **v1 vs vNext scope of these FRs:** **FR-1…FR-10** (encryption scheme + content-key/layer format) and **FR-21…FR-27** (key hygiene, robustness) are **v1** - they apply to the recipient `cp-blob` (read "envelope" = the blob's encrypted layers; the per-layer keys are *wrapped to the recipient* per §6.10, not placed in a fragment). **FR-11…FR-20** (link grammar, publish/view, lifecycle) are **vNext (link/store mode)** and tagged below. The live v1 share/receive functions are in **§6.10** and **PRD-11**.

### Encryption scheme
- **FR-1.** The client MUST encrypt all uploaded content with **AES-256-GCM** via `crypto.subtle.encrypt`, using a per-layer random **96-bit (12-byte) IV** from `crypto.getRandomValues`, and a **128-bit (16-byte) auth tag** (`tagLength: 128`).
- **FR-2.** Each content key MUST be a **256-bit key** generated via `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt'])` (extractable so it can be exported into the fragment). Keys MUST come from the platform CSPRNG; no userland RNG.
- **FR-3.** A **fresh IV MUST be generated per encryption operation** and per layer. An IV MUST never be reused with the same key. The IV is stored in the envelope's `adata` (not secret; integrity-protected, see FR-7).
- **FR-4.** The plaintext for each layer MUST be `gzip`/`deflate`-compressed (via `CompressionStream('deflate')` where available, with a pure-JS fallback) **before** encryption, to shrink transcripts and reduce ciphertext-size leakage signal. Compression type is recorded in `adata` (`"deflate"` or `"none"`); decryption MUST honor it. If `CompressionStream` is unavailable and no fallback succeeds, the client MAY fall back to `"none"`.
- **FR-5.** The two layers MUST use **independent keys**: `K_body` encrypts the body layer, `K_secret` encrypts the secret-map layer. `K_secret` MUST NOT be derivable from `K_body` (resolves **Q-2**; see §6.3). Each layer has its own IV.

### Envelope format
- **FR-6.** The uploaded artifact MUST be the **versioned envelope** defined in §7.1, with a top-level integer **`v`** (format version; v1 = `1`). A client MUST refuse to decrypt an envelope whose `v` it does not understand, with a clear "unsupported format version" error.
- **FR-7.** Each encrypted layer MUST carry an **`adata`** (additional authenticated data) array - `[iv, algo, mode, keyLen, tagLen, compression]` - that is passed as `additionalData` to AES-GCM. This binds the parameters to the ciphertext: a server that alters `iv` or `compression` causes tag verification to fail. `adata` MUST be canonically serialized (deterministic JSON, see FR-9) so encrypt and decrypt agree byte-for-byte.
- **FR-8.** All binary fields in the envelope (`ct`, `iv`) MUST be **base64url (RFC 4648 §5, no padding)**. The `id` and the fragment keys (§7.3) MUST also be base64url. No base64-standard, no base58 (chosen for URL-safety and zero ambiguity; see §6.2).
- **FR-9.** Envelope serialization MUST be **deterministic** (stable key order, no incidental whitespace) so that `adata` integrity and any future signature are reproducible. A `toCanonicalBytes()` / `fromBytes()` pair MUST round-trip losslessly.
- **FR-10.** When there are **no secrets**, the envelope's `secret` field MUST be `null` and no `K_secret` MUST be generated. Presence of `secret` is the single source of truth for "this artifact has a high-priv tier."

### Link grammar & key transport - **vNext (link/store mode)**
- **FR-11.** Keys MUST be transported **only in the URL fragment** (`#…`). Keys MUST NEVER appear in the path, query string, request body, or any header (conforms to SECURITY-MODEL §"Key-handling hygiene").
- **FR-12.** The fragment grammar MUST be exactly: low-priv `#<K_body>`; high-priv `#<K_body>.<K_secret>` - a single `.` (`U+002E`) separator between two base64url tokens (§7.3). The parser MUST reject fragments with extra separators/tokens.
- **FR-13.** Each fragment token MUST be the **base64url-encoded raw 256-bit key** (exported via `crypto.subtle.exportKey('raw', …)` → 32 bytes → 43 base64url chars). The view side reconstructs a `CryptoKey` via `importKey('raw', …)`.
- **FR-14.** A high-priv fragment MUST be **forward-compatible**: a low-priv-only client (or a client that fails to decrypt the secret map) MUST still render the low-priv view from `K_body` alone and MUST NOT error solely because `K_secret` is present/extra.
- **FR-15.** The link MUST point at `…/s/<id>` where `<id>` is the server-assigned blob id (PRD-07). The client MUST NOT embed the key in `<id>`.

### Publish & view behavior - **vNext (link/store mode)**
- **FR-16.** On **Encrypt & Publish**, the client MUST: build the envelope, `POST` it to PRD-07's create endpoint with the chosen `expiry`/`burn` flags as plaintext metadata (§7.4), receive `{ id }`, and assemble link(s) locally. The server response MUST NOT be required to contain any key.
- **FR-17.** The client MUST generate the link string(s) **locally** by concatenating the origin, `/s/`, the returned `id`, `#`, and the exported key(s). Link generation MUST be a pure function of `(origin, id, keys)` and MUST be unit-tested.
- **FR-18.** On view, the client MUST `GET` the envelope, **decrypt the body with `K_body`**, and verify the GCM tag. On tag-verification failure it MUST show a "broken or tampered link" error and MUST NOT render partial/garbled plaintext.
- **FR-19.** On a high-priv view (both keys present **and** `envelope.secret !== null`), the client MUST decrypt the secret map with `K_secret`, verify its tag, and hand `{ redactedSession, secretMap }` to PRD-06's substitution step. If `K_secret` decryption fails, the client MUST degrade to the low-priv view and surface a non-fatal notice, never crash.

### Lifecycle (client side; server enforcement = PRD-07) - **vNext (link/store mode)**
- **FR-20.** The share dialog MUST offer **expiry** options (`1h`, `1d`, `7d` (default), `30d`) and a **burn-after-read** toggle (default off). The chosen expiry is converted to seconds and sent as the `Cp-Expires-In` header to PRD-07 (§7.4); the **content stays encrypted regardless** of lifecycle. **No `never` option in hosted v1** - PRD-07 (FR-5) bounds TTL; a self-host that raises `MAX_TTL` MAY expose a longer/never option, but the default UI does not (D-16).

### Key hygiene
- **FR-21.** After reading the fragment on load, the client MUST strip it from the visible URL via `history.replaceState(null, '', location.pathname + location.search)` while retaining keys in memory.
- **FR-22.** Keys (raw or base64url) MUST NEVER be passed to `console.*`, analytics, error reporters, or any network call. A lint rule / unit test MUST assert no key-bearing value reaches logging sinks (best-effort static check + runtime guard wrapper around the logger).
- **FR-23.** The app MUST set `Referrer-Policy: no-referrer` (meta + header where it controls responses) so that navigations from a shared page cannot leak the fragment-bearing URL via `Referer`. (Note: fragments are not sent in `Referer` by spec, but the *full URL incl. fragment* can leak via JS, `document.referrer` on same-doc nav, and history APIs - so we also avoid putting the fragment into any logged/derived string.)
- **FR-24.** Keys MUST live **in memory only** for the session-view lifetime and MUST NOT be written to `localStorage`, `sessionStorage`, IndexedDB, cookies, or the service-worker cache.
- **FR-25.** The crypto core MUST be a **small, isolated module** (`packages/shared` or `packages/client/src/crypto`) with no network or DOM dependencies in its core functions (pure `encrypt/decrypt/envelope` API), to keep it auditable (gating per PRD-09).

### Robustness
- **FR-26.** All crypto entry points MUST validate inputs (key length, token shape, `adata` arity/values) and throw typed errors (`CryptoFormatError`, `CryptoAuthError`, `CryptoVersionError`) rather than leaking exceptions or producing undefined behavior.
- **FR-27.** Encryption and decryption MUST be covered by **round-trip unit tests** (Vitest), including: empty body, large body, no-secret envelope, two-key envelope, tampered ciphertext (must fail auth), tampered `adata` (must fail auth), wrong key (must fail), version mismatch, and malformed fragments.

## 6. Technical design

### 6.1 Module layout
```
packages/shared/crypto/
  envelope.ts     // types, toCanonicalBytes/fromBytes, version constants
  aesgcm.ts       // generateKey, encryptLayer, decryptLayer (pure, Web Crypto)
  link.ts         // exportKey↔fragment, parseFragment, buildShareLink (pure)
  errors.ts       // CryptoFormatError / CryptoAuthError / CryptoVersionError
packages/client/src/share/
  publish.ts      // orchestration: build envelope → POST (PRD-07) → links
  view.ts         // GET → decrypt → hand off (PRD-06 substitution, PRD-03 render)
```
Core (`envelope/aesgcm/link`) is **pure and isolated** (FR-25): no `fetch`, no DOM. Orchestration lives in the client. This is also the seam where vNext key-wrapping slots in (§6.8) without touching the blob layout.

### 6.2 Encoding choice - base64url (vs. base58)
PrivateBin uses base58 for keys. We choose **base64url (no padding)** uniformly for keys *and* envelope binary fields:
- URL-safe by construction (`-`/`_`, no `+`/`/`/`=`); no percent-encoding surprises in fragments.
- Native, fast, dependency-free (we wrap `btoa`/`atob` or `Uint8Array` helpers); base58 needs a library and big-int math.
- 32-byte key → 43 chars, compact enough. Trade-off vs. base58: marginally less "double-click-selectable" (base58 avoids `_`/`-`), accepted for simplicity and zero deps.

### 6.3 Q-2 resolution - **independent keys** (recommended)
> **Decision: independent random keys for `K_body` and `K_secret`. `K_secret` is NOT derived from `K_body`. (No key hierarchy in v1.)**

**Rationale:**
- **Security clarity & least privilege.** With a hierarchy (e.g. `K_secret = HKDF(K_body, "secret")`), *every low-priv holder could derive the high-priv key* - silently collapsing the two tiers into one and breaking the central guarantee ("low-priv cannot see secrets" is a mathematical fact, SECURITY-MODEL §"Why two keys"). A *reverse* hierarchy (derive `K_body` from `K_secret`) avoids that leak but couples the layers and adds a KDF + ordering constraint for marginal convenience.
- **Simplicity = auditability.** Two independent 256-bit random keys need no KDF, no salt, no domain-separation strings, no iteration tuning - fewer moving parts in the gating security review (PRD-09).
- **Clean vNext seam.** Independent keys are exactly what named-recipient wrapping wants: wrap each key to each recipient's X25519 public key independently (§6.8). A hierarchy would force "give K_body ⇒ also give the ability to derive K_secret," which fights per-tier recipient wrapping.
- **Cost of independence:** the high-priv link must carry **two** tokens (`#<K_body>.<K_secret>`) instead of one. This is a few extra characters and is the explicit, desirable design (the link grammar already accounts for it). The "convenience" of a hierarchy (one token reveals all) is precisely the property we do **not** want.

> The only thing a hierarchy buys (shorter high-priv link / one secret to manage) is outweighed by the tier-collapse risk and the vNext mismatch. **Independent keys win.**

### 6.4 AES-GCM specifics (Web Crypto)
- `encryptLayer(key, plaintextBytes)` → `{ ct, iv, adata }`:
  1. `iv = getRandomValues(new Uint8Array(12))`.
  2. `compressed = deflate(plaintextBytes)` (FR-4); set `compression`.
  3. `adata = canonicalBytes([iv_b64url, "aes", "gcm", 256, 128, compression])`.
  4. `ct = subtle.encrypt({ name:'AES-GCM', iv, tagLength:128, additionalData: adata }, key, compressed)`.
     (Web Crypto appends the 128-bit tag to `ct`; we store `ct` as the tag-suffixed ciphertext.)
- `decryptLayer(key, ct, adata)`: rebuild `additionalData` from `adata`, `subtle.decrypt(...)`, then inflate per `compression`. A modified `ct`, `iv`, or `compression` makes `decrypt` throw → mapped to `CryptoAuthError` (FR-18).
- **IV uniqueness (FR-3):** 96-bit random IVs are safe for the tiny number of encryptions per key here (each key encrypts exactly **one** layer, **once**). Collision risk is non-existent at this volume; we never re-encrypt with an existing key.

### 6.5 Why `adata` (additional authenticated data)
Following PrivateBin v2: the cipher parameters (`iv`, algo, mode, sizes, compression) are **not secret but must be integrity-protected**. Feeding them as GCM `additionalData` means a malicious server cannot, e.g., flip `compression` to corrupt decompression or swap an `iv` to attempt manipulation - any tampering fails the tag. The format version `v` is outside per-layer `adata` but is checked first (FR-6) and could be folded into a top-level signed header in vNext.

### 6.6 Burn-after-read & expiry semantics - **vNext (deferred)**
> Lifecycle requires a server; not in v1 (D-29). Retained for the store addon (PRD-07).
- **Expiry (TTL):** server-side metadata only (PRD-07). After expiry, `GET /s/<id>` returns **410 Gone**; content was always ciphertext. Client shows the expired state (§4.2).
- **Burn-after-read:** the **destroying read is the `GET /v1/blobs/:id`** that returns the envelope; PRD-07 deletes the blob atomically on first successful fetch. To avoid **link-preview/prefetch** silently burning a paste, the client MUST gate the destroying fetch behind the §4.2 interstitial, using a **non-destructive metadata peek** (`GET /v1/blobs/:id/meta`, PRD-07 FR-8) to know it's a burn paste *before* fetching. Documented race (carry to PRD-07): two simultaneous reads - only one wins the envelope, the other gets 410; this is acceptable and documented.
- **Two-key + burn:** burn destroys the **whole envelope** (both layers) on first read - there is no per-tier burn in v1. A high-priv and a low-priv viewer racing on a burn link means only one gets the content; this is an intentional, documented limitation (carry to **Open questions** & PRD-07).
- **Q-3 resolution** - see §11.

### 6.7 Random keys vs. passphrase (why no PBKDF2 in v1)
PrivateBin derives the working key from the URL key via PBKDF2 to support an *optional human passphrase*. v1 claudepad uses a **raw random 256-bit key in the fragment** - there is no human passphrase, so PBKDF2 over a full-entropy random key adds cost without security benefit. The envelope's `adata` *reserves* `kdf`-style slots conceptually (we keep them out of v1 to stay minimal); a future passphrase mode would (a) add `salt` + `iterations` to `adata`, (b) derive `K_body'` = PBKDF2(passphrase, fragmentKey). This is additive and version-gated - not a re-architecture.

### 6.8 vNext seam - named-recipient / X25519 (must not be precluded)
The v1 layout is deliberately compatible with vNext wrapping:
- The **body/secret ciphertext layout does not change.** Today the keys travel in the fragment. In vNext, the *same* `K_body`/`K_secret` are instead **wrapped to each recipient's X25519 public key** (ECDH → AES-KW / HKDF), and the wrapped keys are stored server-side in an envelope extension (`recipients: [{ kid, wrappedBody, wrappedSecret? }]`).
- Because keys are **independent** (§6.3), wrapping is per-key and per-recipient with no derivation coupling - exactly the granularity revocation/per-person tiers need.
- The format **version `v`** and the pure crypto seam (§6.1) let a `v: 2` envelope add a `recipients` block and a `mode: "link" | "recipients"` discriminator without touching `encryptLayer`/`decryptLayer`. Link-mode and recipient-mode share the inner ciphertext.

### 6.9 Libraries & trade-offs
- **Web Crypto only** (`_context.md` §3): no `crypto-js`, no custom primitives. Compression via `CompressionStream` with a tiny `fflate` fallback (pure, audited, ~8KB) - the only crypto-adjacent dep, and it touches no key material.
- **Trade-off:** GCM tag-suffixed ciphertext vs. separate `tag` field - we keep Web Crypto's native tag-suffixed `ct` (simpler, no manual splitting). Documented so PRD-07/other clients interop.

### 6.10 Recipient wrapping & fingerprint primitives (v1 core) - **the live path**

These are what v1 actually uses (the §7.1 envelope/§7.3 link/§7.4 wire pieces are vNext). All verified in `poc/`.

- **`deriveWrappingKey(privKey, pubKey)`** - `ECDH P-256 deriveBits(256)` → `HKDF-SHA256(salt=∅, info="claudepad-poc-v1")` → AES-256-GCM `KW`. Symmetric: `ECDH(eph_priv, Rpub) == ECDH(Rpriv, eph_pub)`.
- **`createBlob(senderId, recipientPub, redactedBytes, secretBytes?, tier)`** - generate independent `K_body`(/`K_secret`); generate an **ephemeral ECDH keypair** per share; `KW = deriveWrappingKey(eph_priv, recipientPub)`; `wrap = AES-GCM(KW, JSON{kb, ks?})` (`ks` only at body+secret tier); `body = AES-GCM(K_body, redacted)`, `secret = AES-GCM(K_secret, secretMap)|null`. Returns the **PRD-11 `ShareBlob`**.
- **`openBlob(myPriv, blob)`** - `KW = deriveWrappingKey(myPriv, blob.eph)`; unwrap content keys; decrypt `body` always, `secret` iff `ks` granted **and** present; throws `CryptoAuthError` (fail-closed) when not addressed to this identity.
- **`fingerprint(pubKeyB64)`** - `SHA-256(rawPub)` → 6 emoji (palette of 64, `byte & 63`) + 8-hex code (`XXXX-XXXX`). Deterministic; used by PRD-10/PRD-11 for out-of-band verification.

> The blob format these produce is owned by **PRD-11 §7**; the identity keypair by **PRD-10**. PRD-05 owns the primitives above.

## 7. Data model / API

### 7.1 Envelope (the uploaded blob) - typed - **vNext (link/store mode)**
> The v1 artifact is the **PRD-11 `ShareBlob`** (recipient-wrapped, §6.10). The upload envelope below applies only to the deferred link/store path.

```ts
/** Format version of the claudepad share envelope. v1 = 1. */
export const ENVELOPE_VERSION = 1 as const;

/** Base64url string (RFC 4648 §5, no padding). */
type B64Url = string;

/** Compression applied to plaintext before AES-GCM. */
type Compression = 'deflate' | 'none';

/**
 * Cipher parameters, authenticated as AES-GCM additionalData (NOT encrypted).
 * Fixed tuple order; canonically serialized; integrity-bound to the ciphertext.
 * [ iv, algo, mode, keyLenBits, tagLenBits, compression ]
 */
type AData = [B64Url, 'aes', 'gcm', 256, 128, Compression];

/** One independently-encrypted layer (tag is suffixed into `ct` by Web Crypto). */
type EncLayer = {
  ct: B64Url;     // AES-256-GCM ciphertext WITH 128-bit tag suffixed
  adata: AData;   // authenticated cipher params (contains the iv)
};

/** The full uploaded artifact. Server stores this opaquely (PRD-07). */
export type ShareEnvelope = {
  v: 1;                 // format version (FR-6); checked before any decrypt
  mode: 'link';         // v1 only; vNext adds 'recipients' (§6.8)
  body: EncLayer;       // redacted transcript, encrypted with K_body
  secret: EncLayer | null; // secret map (PRD-06), encrypted with K_secret; null if no secrets (FR-10)
  // NOTE: lifecycle (expiry/burn) is NOT in the envelope - it is plaintext
  // metadata sent alongside to PRD-07 (§7.4) so the server can enforce it.
};
```

**Plaintext contents of each layer (before compression + encryption):**
- `body` plaintext = JSON of the **redacted `Session`** (PRD-02 model, secrets → opaque `S1…` placeholders by PRD-06).
- `secret` plaintext = JSON of the **secret map**, e.g. `{ "S1": "sk-live-…", "S2": "ghp_…" }` (shape owned by PRD-06; this PRD only encrypts/decrypts it as opaque bytes).

### 7.2 Canonical serialization
`toCanonicalBytes(env)` → deterministic, key-sorted, whitespace-free JSON → `TextEncoder` bytes (FR-9). `fromBytes(bytes)` parses + validates (`v`, `mode`, layer shape, `adata` arity) → throws `CryptoFormatError` / `CryptoVersionError` on mismatch. This is what PRD-07 stores and returns verbatim.

### 7.3 Link grammar (formal) - **vNext (deferred; link mode)**
> v1 has no links - the share is a self-contained blob (PRD-11 §7). This grammar applies only when the optional store addon + link mode ship.

```
share-link   = origin "/s/" id "#" fragment
id           = 1*base64url-char                ; server-assigned (PRD-07)
fragment     = body-key [ "." secret-key ]     ; '.' = U+002E, single
body-key     = base64url(raw K_body)           ; 32 bytes → 43 chars
secret-key   = base64url(raw K_secret)         ; 32 bytes → 43 chars
base64url-char = ALPHA / DIGIT / "-" / "_"

; Low-privilege : …/s/<id>#<body-key>
; High-privilege: …/s/<id>#<body-key>.<secret-key>
```

Parser rules (FR-12, FR-14): split fragment on the **first** `.`; ≥2 tokens with extra `.` → reject (`CryptoFormatError`); 1 token → low-priv; 2 tokens → attempt high-priv but degrade to low-priv if `secret` is absent or `K_secret` decryption fails (never error solely on extra key).

### 7.4 Wire contract with the store addon (create / fetch) - **vNext (deferred)**

> Not in v1. The v1 share output is a self-contained blob (PRD-11), carried by the user - there is no upload. This wire contract applies only to the optional **Store Provider** addon (open spec, `../STORE-PROVIDER-SPEC.md`; reference impl = PRD-07). When that ships, the store accepts the opaque blob and serves it back by id via the `StoreProvider` interface; the crypto core is unchanged.

```ts
// CREATE - POST /v1/blobs   (PRD-07 FR-1/FR-2)
//   Body  = the RAW envelope bytes (application/octet-stream) =
//           toCanonicalBytes(ShareEnvelope). Opaque to the server.
//   Lifecycle is sent as PLAINTEXT HEADERS, never inside the body:
//     Cp-Expires-In:       <seconds>   // e.g. 604800 for the 7d default
//     Cp-Burn-After-Read:  true|false  // default false
//   NO keys, NO plaintext transcript, NO secret values. Ever. (FR-11)
//
// The client converts its expiry choice (1h|1d|7d|30d) to seconds for
// Cp-Expires-In. There is NO 'never' option in hosted v1 (PRD-07 FR-5
// forbids unbounded TTL; self-host MAY raise MAX_TTL). See §6.6 / Q-3.
type CreateResponse = {                  // PRD-07 §7.2 `201 Created`
  id: string;                            // base62, ≥128-bit; never a key
  createdAt: string; expiresAt: string;
  burnAfterRead: boolean; size: number;
  deleteToken: string;                   // capability token; client MAY store
                                         // to enable later DELETE (PRD-07 FR-17)
  url: string;                           // path only ("/s/<id>"); client appends #key
};

// PEEK (non-destructive) - GET /v1/blobs/:id/meta   (PRD-07 FR-8; §6.6)
//   Never increments viewCount, never burns. Used for the burn interstitial.
type PeekResponse = {
  id: string; createdAt: string; expiresAt: string;
  burnAfterRead: boolean; size: number; viewCount: number;
};

// FETCH (destroying read if burn) - GET /v1/blobs/:id   (PRD-07 FR-7/FR-9)
//   200 → raw envelope bytes | 410 Gone (expired/burned) | 404 (never existed)
//   `/s/:id` itself serves the SPA shell (PRD-07 FR-25), NOT the ciphertext.
type FetchResponse = ShareEnvelope;      // after fromBytes() of the 200 body
```

### 7.5 Public crypto API (this PRD)
```ts
function generateContentKey(): Promise<CryptoKey>;            // FR-2
function encryptLayer(key: CryptoKey, plaintext: Uint8Array): Promise<EncLayer>;  // FR-1/3/4
function decryptLayer(key: CryptoKey, layer: EncLayer): Promise<Uint8Array>;       // FR-18 (throws CryptoAuthError)
function keyToFragmentToken(key: CryptoKey): Promise<B64Url>; // FR-13 (exportKey raw → b64url)
function fragmentTokenToKey(t: B64Url): Promise<CryptoKey>;   // FR-13 (importKey raw)
function parseFragment(frag: string): { bodyKey: B64Url; secretKey?: B64Url }; // FR-12
function buildShareLink(origin: string, id: string, bodyKey: B64Url, secretKey?: B64Url): string; // FR-17
function buildEnvelope(redactedBytes: Uint8Array, secretBytes?: Uint8Array)
  : Promise<{ envelope: ShareEnvelope; bodyKey: CryptoKey; secretKey?: CryptoKey }>;
```

## 8. Security & privacy

Conformance to `_context.md` §5 / `SECURITY-MODEL.md`:

- **§5.1 Zero-knowledge baseline ✓** - random AES-256-GCM key, client-side encryption, ciphertext-only upload, key in fragment (FR-1, FR-2, FR-11, FR-16). The server (incl. claudepad.io) cannot decrypt.
- **§5.2 Two-key tiered reveal ✓** - independent `K_body`/`K_secret`, both ciphertexts uploaded, tier = which keys the link carries (FR-5, FR-10, FR-12, §6.3). "Low-priv cannot see secrets" is mathematical: the secret map is a separate ciphertext under a key low-priv never receives.
- **§5.3 Placeholder rules ✓ (deferred owner PRD-06)** - this PRD encrypts the secret map under `K_secret`; the opaque-ID + type/length placeholders live in the body plaintext and are PRD-06's responsibility. No hash of any secret ever enters the body (we never compute one here).
- **§5.4 Best-effort redaction ✓** - a missed secret sits in the `body` plaintext, protected from the host but visible to all tiers; this PRD does **not** weaken that (encryption is the same), and relies on PRD-06's mandatory review-before-share (we never auto-publish; publish is an explicit user action, §4.1).
- **§5.6 Lifecycle ✓** - expiry/burn as plaintext metadata to PRD-07; content stays encrypted regardless (FR-20, §6.6).
- **§5.7 Threat-model caveats (documented, not buried):**
  - Server still learns **blob size, timing, access counts, IP**. We reduce size signal via compression (FR-4) but do not hide it. *Documented.*
  - **Fragment leakage** via shoulder-surfing, screen-share, browser history, referrer mishandling. Mitigations: strip fragment from address bar on load (FR-21), `no-referrer` (FR-23), never log keys (FR-22), in-memory only (FR-24), and explicit UI warning that "the link IS the key" (§4.1). We **acknowledge** these are mitigations, not guarantees.
  - **High-priv link mishandling** - a sharer pasting the high-priv link publicly leaks all secrets. Mitigated by visual quarantine + warning (§4.1), not crypto.
- **§5.8 vNext not precluded ✓** - independent keys + versioned envelope + pure crypto seam make X25519 wrapping additive (§6.8).

**Risks introduced by this PRD:**
- **R1 - Tag-suffixed `ct` interop:** other clients must know the tag is suffixed (Web Crypto convention). *Mitigation:* documented in §6.9 + format version + `adata`.
- **R2 - `adata` canonicalization drift** between client versions could break decryption. *Mitigation:* fixed tuple order, deterministic serialization, round-trip tests (FR-9, FR-27).
- **R3 - Prefetch burning a paste:** link-preview bots issuing `GET /v1/blobs/:id` could destroy a burn paste. *Mitigation:* peek-before-fetch (`GET /v1/blobs/:id/meta`, non-destructive per PRD-07 FR-8) + interstitial (§4.2, §6.6); the destroying fetch is gated behind explicit user confirmation.
- **R4 - Key in fragment surviving in history/extensions** beyond our control. *Mitigation:* documented limit; FR-21/23/24 reduce but cannot eliminate.

## 9. Dependencies

**Upstream (this PRD needs):**
- **PRD-02** - the normalized `Session` model that the body layer serializes.
- **PRD-04** - triggers the publish action (share entry point) and the CLI upload path.

**Downstream (depend on this PRD):**
- **PRD-06** - fills the `secret` layer (secret map) and owns review-before-share + opaque placeholders; consumes `buildEnvelope`/`decryptLayer` and the high/low-priv link semantics.
- **PRD-07** - stores/serves the `ShareEnvelope` opaquely and enforces the `meta` lifecycle (expiry/burn, peek). Wire contract agreed in §7.4.
- **PRD-03** - renders the decrypted `redactedSession` (and substituted secrets for high-priv).
- **PRD-09** - gates v1 on an **independent security review of this crypto core** (and PRD-06 secret handling).

## 10. Acceptance criteria / DoD

- [ ] `encryptLayer`/`decryptLayer` round-trip for empty, small, and large (multi-MB) bodies (FR-1–4, FR-27).
- [ ] Tampering with `ct`, `iv`, or `compression` (in `adata`) makes decryption throw `CryptoAuthError`; no partial plaintext is rendered (FR-7, FR-18, R2).
- [ ] Wrong-key decryption fails cleanly; version-mismatch throws `CryptoVersionError` (FR-6, FR-26).
- [ ] `buildEnvelope` with secrets → two-key envelope + two fragment tokens; without secrets → `secret: null` + single token, **no `K_secret` generated** (FR-5, FR-10, FR-17).
- [ ] Low-priv link renders placeholders; high-priv link substitutes real secrets; high-priv client degrades to low-priv (not crash) when `secret` is absent or `K_secret` fails (FR-14, FR-19).
- [ ] Link grammar parser: accepts `#k`, `#k.s`; rejects `#k.s.x` and malformed tokens (FR-12, §7.3).
- [ ] **Network-capture test:** a Playwright run of the publish flow shows the upload body contains **no plaintext transcript, no secret value, and no key** - only the envelope + plaintext `meta` (Success metric: "zero-knowledge verifiable", ROADMAP §6).
- [ ] Fragment is stripped from the address bar after load; keys never appear in `console`, storage, or any network call (FR-21, FR-22, FR-24; runtime + lint assertion).
- [ ] `Referrer-Policy: no-referrer` applied to shared views (FR-23).
- [ ] Burn-after-read: peek-before-fetch interstitial prevents prefetch from silently burning; first successful fetch yields content, second yields 410 (FR-20, §6.6, with PRD-07).
- [ ] Crypto core builds and tests with **only Web Crypto + one compression fallback dep**; no custom primitives (FR-2, FR-25, §6.9).
- [ ] Envelope `toCanonicalBytes`/`fromBytes` round-trips byte-for-byte; PRD-07 stores and returns it unchanged (FR-9).
- [ ] Q-2 (independent keys) and Q-3 (expiry/burn defaults) decisions recorded in `DECISIONS.md`.

## 11. Open questions

- **Q-2 - RESOLVED here:** **Independent keys** (no hierarchy). `K_secret` is not derivable from `K_body`. Rationale in §6.3 (tier-collapse risk of a forward hierarchy, simplicity/auditability, clean vNext wrapping seam). *Action: add to `DECISIONS.md` Resolved as D-13.*
- **Q-3 - RESOLVED & reconciled with PRD-07 (D-14, D-16):**
  - **Default expiry: `7d`.** Options `1h / 1d / 7d / 30d`. Rationale: most shares are short-lived "look at this session" links; 7 days balances "still works when a teammate opens it Monday" against unbounded lingering. **`never` is NOT offered in hosted v1** - PRD-07 FR-5 bounds TTL (storage/abuse); a self-host that raises `MAX_TTL` may expose it (D-16). *Consolidation note: PRD-07 FR-2's example default of 30d was aligned down to **7d** to match this - `DEFAULT_TTL` is config-driven (PRD-09 env reference), default `604800`s.*
  - **Burn-after-read: offered, default OFF**, and **offered for two-key (tiered) shares too** - burn destroys the *whole envelope* (both layers) on first read; there is **no per-tier burn** in v1 (§6.6). Rationale: per-tier burn would require independent server lifecycle per layer (more backend surface, racey semantics); whole-envelope burn is simple and honest. (D-14.)
  - **Resolved with PRD-07:** (a) the **burn-race** when low- and high-priv viewers open simultaneously - only one wins (PRD-07 FR-14 single-winner claim); documented limitation. (b) Non-destructive peek is `GET /v1/blobs/:id/meta` (PRD-07 FR-8), guaranteed not to burn/increment. (c) `never`-expiry is config-gated via `MAX_TTL` (PRD-09).
- **Q-OPEN - compression-size side channel:** `deflate` reduces but does not hide ciphertext size; for tiny secret maps, the *presence* of a `secret` layer (vs. `null`) reveals "this artifact has secrets" to the server. Acceptable for v1 (metadata, already in threat model §5.7) - flag for the security review whether to pad the secret layer to a fixed bucket.
- **Q-OPEN - base64url vs. base58 selectability:** base64url's `-`/`_` slightly hurts double-click selection of links; accepted for zero-dep simplicity (§6.2). Revisit if UX testing shows link-copy friction.

## 12. Phase / milestone

**Phase P2 - Hosted Sharing** (ROADMAP §3). Built alongside **PRD-07** (backend); on the critical path after PRD-04 and before **PRD-06** (`… → PRD-04 → PRD-07 → PRD-05 → PRD-06 → …`). This PRD's envelope and link grammar are the contract PRD-06 (secrets) and PRD-07 (storage) build against. **Gating for v1:** independent security review of this crypto core (PRD-09).

---

### Sources (format grounding)
- PrivateBin encryption format (v2 `adata`, AES-256-GCM, base58 fragment key): `github.com/PrivateBin/PrivateBin/wiki/Encryption-format`
- Web Crypto AES-256-GCM + IV/tag/PBKDF2 patterns: MDN `SubtleCrypto`; cross-platform AES-GCM-256 references.
