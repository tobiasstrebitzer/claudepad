# claudepad - Registry Spec (store + identity directory)

> **Status:** open spec, **vNext** (the optional addon). **v1 ships the seam, not the registry** - the static client contains no registry implementation and no `claudepad.io` registry URL (extends DECISIONS D-30…D-33, D-74).
> **Principle:** a registry is an **open contract, not a proprietary service**. Like Bitwarden (point your client at any server URL) or Tailscale↔Headscale (open protocol + reference control server), `claudepad.io/registry` would be *one* free, open-source reference implementation - vendors and teams run their own.
> **Supersedes scope:** this absorbs and extends `STORE-PROVIDER-SPEC.md` (the zero-knowledge blob store is now one axis of a registry).

## 0. One paragraph

A **registry** is an optional, opt-in server a claudepad client can be pointed at to do three things a serverless client can't: **host** a session blob so a recipient fetches it by a short id instead of carrying the whole thing, **look up a recipient by name** instead of pasting their public key out-of-band, and (for teams that want it) **store readable sessions** under organizational access control. None of this changes the v1 trust model unless you choose a registry that asks you to: by default a registry only ever sees **opaque ciphertext** and a **public-key directory**. The spec's whole job is to make *what a given registry is trusted for* explicit and honest.

## 1. Why this note exists

v1 is **entirely client-side** and launches with **zero registry dependency** (carry-the-blob sharing, out-of-band fingerprint trust). But the moment a team uses claudepad, three questions recur: "where do I put the blob so I don't paste 200 KB into Slack?", "how do I share with a colleague without a key-exchange ritual?", and "can our org keep a searchable archive?". A registry answers all three. This spec pins the contract so adding one later is a clean drop-in, the v1 bundle stays pure, and every registry is honest about its trust posture.

## 2. The three axes

A registry is trusted along (at most) three **independent** axes. A registry advertises which it offers; the client surfaces each honestly.

| Axis | Question it answers | v1 default (no registry) | What a registry can add |
|---|---|---|---|
| **Availability** | Who stores/serves the blob? | The user carries it (clipboard/`.cpad`) | Host the blob, hand back a short id/URL |
| **Authenticity** | Does pubkey X really belong to person Y? | Out-of-band **fingerprint** only | A **directory** that vouches at a declared assurance level |
| **Confidentiality** | Can the registry read the session? | No host exists, so no | **Default: no** (opaque ciphertext). **Opt-in trusted mode: yes** |

The existing `STORE-PROVIDER-SPEC.md` covered a zero-knowledge slice of **Availability** only. This spec keeps that and adds **Authenticity** (the directory) and an explicit, opt-in relaxation of **Confidentiality** (trusted mode).

## 3. Principles

1. **Spec, not service.** What we publish is an HTTP contract. `claudepad.io/registry` is one reference implementation; anyone can run their own.
2. **Opt-in, pluggable, null by default.** No registry is configured out of the box. A user/org points the client at a registry by URL. The v1 client ships only the *interface*.
3. **Honest about trust.** A registry declares its modes and per-identity assurance in a capability manifest; the client **shows the trust level before any action that depends on it** (publishing a readable session, or trusting a directory key). Honesty over polish (`TRUSTLESS-MODEL.md` §7).
4. **Zero-knowledge is the default, not the ceiling.** The default publish path is the proven encrypt-to-recipient blob - the registry stores ciphertext. Readable storage is a separate, clearly-labeled opt-in.
5. **TLS is mandatory, always.** Every registry interaction is HTTPS. The client **rejects a non-`https://` registry URL** (except an explicit `http://localhost` dev allowance). See §8.
6. **No lock-in.** The v1 client contains no registry implementation and no `claudepad.io` registry URL or registry-specific code (D-33, D-74). The registry URL is plain config with an empty default.

## 4. Confidentiality: the two publish modes (D-75)

A registry declares one or both modes in its manifest (`modes`). The client never silently changes mode; the chosen mode is shown at publish time.

### 4.1 Zero-knowledge (default)

The registry is a directory + a dumb CDN for ciphertext. It cannot read sessions.

```
1. Resolve recipient(s) -> public-key card(s) (from the directory, §5, or pasted)
2. Encrypt client-side, exactly as today:
     single recipient -> createBlob   (cp-blob-…)
     several          -> createMultiBlob (one blob, per-recipient wrapped keys)
3. put(opaqueBlob) -> { id, url }      // registry stores ciphertext only
4. Recipient: get(id) -> opaqueBlob -> openBlob with their identity
```

The crypto is **identical** to carry-the-blob sharing (`TRUSTLESS-MODEL.md` §3); the registry only *transports* the bytes. A non-recipient (including the registry operator) derives a different `KW` and AES-GCM auth fails - `poc/verify.mjs` already proves this.

**Honest metadata trade-off.** If the registry offers an *inbox* ("everything shared with me"), the upload must carry a recipient index (e.g. a hash of the recipient's public key) so it can be served back. That reveals the **social graph** (who shares with whom, and when) to the registry, even though content stays encrypted. This is opt-in per-put (`indexFor`), off by default, and surfaced in the UI. Content confidentiality is preserved either way.

### 4.2 Trusted (explicit opt-in)

For orgs that legitimately want server-side reading - archive search, org-wide access, server rendering. The client uploads the session **plaintext over TLS**; the registry holds it (encrypted at rest under the registry's own key) and **can read it**. This is **not zero-knowledge** and is a real trust shift.

- The client **must** display a clear, non-dismissible-by-default notice ("This registry can read this session") and require explicit confirmation before the first trusted publish to a given registry.
- Secret detection/redaction (PRD-06) still runs; the tier choice still applies. Trusted mode changes *who can read the body*, not whether secrets are reviewed.
- Suited to an internal corporate registry where the org already has a right to the data. Never the default; never silent.

## 5. Authenticity: the identity directory (D-76)

A registry **may** expose a directory mapping a human-resolvable handle/name to a **public-key card** plus an **assurance level** describing *how the registry verified that binding*. This consciously relaxes `TRUSTLESS-MODEL.md` §8 ("not a key directory or PKI") - **for the opt-in addon only**, and only as honestly-labeled trust, never silent.

### 5.1 Assurance levels

| Level | Meaning | Client behavior |
|---|---|---|
| `self` | Self-asserted; anyone published this card. The registry vouches for **nothing** (it's a cache). | **Unchanged from v1:** require the out-of-band **fingerprint** confirm before encrypting. |
| `domain` | The registry verified control of an email domain / DNS (the key belongs to *someone@acme.com*). | May skip the manual fingerprint dance; **must** show "verified by `<registry>` via domain `acme.com`" + the fingerprint. Trust reduces to "I trust this registry's domain check." |
| `sso` | The registry authenticated the person via an identity provider (OIDC/SAML) - strongest, within that org's trust boundary. | May skip the manual dance; **must** show "verified by `<registry>` via SSO (`<idp>`)" + the fingerprint. |

Rules that hold for every level:

- The client **always** computes and can display the **fingerprint** (`SHA-256(rawPublicKey)`, the §5 emoji+hex) - assurance never replaces it, it augments it.
- Trust in a `domain`/`sso` entry is **trust in the registry**. The client states this plainly; a user who doesn't trust the registry falls back to `self` semantics (manual fingerprint).
- A directory entry is a **public** artifact (`cp-pub-…` card + metadata). No private key ever touches a registry.

### 5.2 Share-with-a-known-identity flow

```
1. User searches the directory by name/handle (registry returns matching cards + assurance)
2. Client shows each candidate's name, handle, assurance badge, and fingerprint
3. User picks recipient(s):
     - domain/sso: confirm with one tap (assurance shown)
     - self:       confirm the fingerprint out-of-band (v1 ritual, unchanged)
4. Encrypt-to-recipient (§4.1) and publish
```

This is the friction win: for a verified colleague, "share with Dana" replaces "get Dana's key, confirm the fingerprint, then encrypt" - without the client ever pretending an unverified key is verified.

## 6. The capability manifest

A registry serves a manifest (e.g. `GET /.well-known/claudepad-registry`) so the client can feature-detect and label honestly. The client treats unknown fields tolerantly.

```ts
export interface RegistryManifest {
  readonly id: string;                 // e.g. "claudepad.io/registry", "acme-internal"
  readonly name: string;               // human label shown in the UI
  readonly baseUrl: string;            // MUST be https:// (or http://localhost for dev)
  readonly tls: 'required';            // the only legal value; clients reject otherwise
  readonly webApp?: string;            // §7.1: the SPA this registry is paired with. Set => it serves a /s/<id> share link that redirects here. Absent => no redirect.
  readonly modes: Array<'zero-knowledge' | 'trusted'>;  // confidentiality (§4)
  readonly directory?: {               // authenticity (§5); absent => no directory
    enabled: boolean;
    assurance: Array<'self' | 'domain' | 'sso'>;  // levels this registry can issue
    verifiedBy?: string;               // org/domain that backs domain/sso entries
  };
  readonly trustedAtRest?: string;     // OQ-R4: honest free-text posture for trusted mode, e.g. "AES-256 at rest, operator-held key". Shown before a trusted publish; no conformance requirement.
  readonly store: StoreCapabilities;   // availability lifecycle (expiry/burn/delete/limits)
}
```

`StoreProvider` (from `STORE-PROVIDER-SPEC.md`) is unchanged for the blob-transport surface and is extended with the directory + manifest surface:

```ts
export interface RegistryProvider extends StoreProvider {
  readonly manifest: RegistryManifest;
  /** Authenticity: resolve recipients by handle/name. ZK-compatible (returns public cards only). */
  lookup(query: string): Promise<DirectoryEntry[]>;
  resolve(handle: string): Promise<DirectoryEntry | null>;
  /** Optional: publish your own public card at a claimed assurance the registry then verifies. */
  publishIdentity?(card: string /* cp-pub-… */): Promise<DirectoryEntry>;
  /** OQ-R3: revoke = purge. Delete a directory entry (and rotation = re-publish under the same handle). */
  revokeIdentity?(handle: string): Promise<void>;
}

export interface DirectoryEntry {
  handle: string;                      // registry-scoped, e.g. "dana@acme"
  name: string;                        // self-claimed display name
  pub: string;                         // cp-pub-… card (public key only)
  fingerprint: string;                 // SHA-256(rawPub) emoji+hex (client may recompute)
  assurance: 'self' | 'domain' | 'sso';
  verifiedBy?: string;                 // e.g. "acme.com" for domain/sso
}

// put() gains an optional recipient index for the opt-in inbox (§4.1). Off by default.
export type RegistryPutOptions = StorePutOptions & { indexFor?: string[] /* recipient pub hashes */ };
```

`NoRegistryProvider = null` remains the v1 default - the client wires the *interface*, never a concrete provider.

## 7. HTTP contract (sketch; full OpenAPI = reference-impl work)

All over HTTPS. Endpoints are illustrative; the reference implementation pins the exact shapes + an OpenAPI doc.

| Method | Path | Purpose | Mode |
|---|---|---|---|
| `GET` | `/.well-known/claudepad-registry` | Capability manifest (§6) | any |
| `POST` | `/blobs` | Upload opaque ciphertext (+ optional `indexFor`) → `{ id, url }` | zero-knowledge |
| `GET` | `/blobs/{id}` | Fetch opaque bytes | zero-knowledge |
| `GET` | `/s/{id}` | Share short link: 302 → `webApp?share=<id>&r=<baseUrl>` (only if `webApp` set, §7.1) | zero-knowledge |
| `GET` | `/inbox` (authn) | List ids addressed to my pub (opt-in index) | zero-knowledge |
| `POST` | `/sessions` | Upload a **readable** session over TLS → `{ id, url }` | trusted |
| `GET` | `/sessions/{id}` (authz) | Fetch a readable session (org access control) | trusted |
| `GET` | `/directory?q=` | Search identities → `DirectoryEntry[]` | directory |
| `GET` | `/directory/{handle}` | Resolve one identity | directory |
| `POST` | `/directory` (authn) | Publish/claim your card (registry then verifies assurance) | directory |
| `DELETE` | `/directory/{handle}` (authn) | **Revoke = purge** the entry (OQ-R3); rotation = re-`POST` under the same handle | directory |
| `DELETE` | `/blobs/{id}` / `/sessions/{id}` | Lifecycle, if `capabilities.delete` | any |

Abuse/takedown: in **zero-knowledge** mode an operator acts on **id + reports**, never content (it can't read it); in **trusted** mode the operator can moderate content directly (a property of having chosen to be readable).

### 7.1 Share short links (D-87)

A blob `id` is not friendly to hand to a person. When a registry advertises a `webApp` in its manifest, it also serves a **clickable short link** that opens the session in that app:

- `POST /blobs` returns `url` = `…/s/<id>` (instead of the raw `/blobs/<id>`). This is what the client surfaces as the "Share link".
- `GET /s/<id>` responds **302** → `webApp?share=<id>&r=<baseUrl>`.
- The app reads `share` (the blob id) and the optional `r` (the issuing registry), fetches the **opaque** ciphertext from `r`, and decrypts locally. Because the link carries its own registry, it opens even for a recipient who never connected that registry - no prior setup, nothing leaks (the registry only ever serves ciphertext).

The link **points at the registry, not the app**, so the client stays registry-agnostic: the registry (which alone knows its own URL and paired app) owns the redirect. `r` is runtime data over the existing HTTPS-guarded fetch path, so no origin is hardwired and the no-external-origins gate stays green. A registry with no `webApp` simply omits the redirect and returns the raw blob URL (still openable by paste). Pasted `/s/<id>`, `?share=<id>`, and `/blobs/<id>` links all route to receive-by-id too.

## 8. Transport & security requirements (D-77)

- **HTTPS mandatory.** The client rejects any registry `baseUrl` that is not `https://`, except a literal `http://localhost`/`127.0.0.1` for development. No plaintext HTTP, ever.
- **No mixed content / no downgrade.** A manifest must declare `tls: 'required'`; the client refuses to proceed otherwise. HSTS is expected on real registries.
- **The registry is in the data path only for transport (ZK) or by explicit consent (trusted).** TLS protects bytes in flight; in ZK mode the payload is *already* ciphertext, so TLS termination at the registry reveals nothing. In trusted mode TLS protects the plaintext upload, and at-rest protection is the registry operator's responsibility (and trust assumption).
- **Identity keys never leave the client.** The directory holds public cards only.
- **CSP unchanged.** Configuring a registry adds exactly one allowed connect-src origin (the registry URL); the bundle still ships no third-party scripts/CDNs (`TRUSTLESS-MODEL.md` §7).

## 9. What v1 ships vs. vNext

**v1 (the seam only):**
- ✅ `StoreProvider` + `NoStoreProvider` (already specified) and the `RegistryProvider`/`RegistryManifest` *types*. **No implementation.**
- ✅ The blob format is already registry-ready: self-contained opaque ciphertext; a registry hands back the same bytes.
- ❌ **No** `claudepad.io/registry` URL, branding, directory UI, or trusted-mode code in the v1 client (D-33, D-74). Registry URL is config with an empty default.
- ❌ **No** assumption anywhere (PRD-03/04/05/06/10/11) that a registry exists; every flow works fully offline.

**vNext (this spec + reference impl, ex-PRD-07):** concrete endpoints + OpenAPI, the id scheme, the directory + assurance verification (domain/SSO), trusted-mode storage + access control, lifecycle (expiry/burn/delete), abuse/takedown, rate limiting, storage adapters (Cloudflare R2/D1, Node/Postgres/S3), and `claudepad.io/registry` as the canonical reference implementation.

**Built in-repo (2026-06-22, D-79):** the contract and a working reference implementation now exist as packages **outside the v1 client bundle**:
- `@claudepad/registry-spec` - the contract (provider interfaces, wire DTOs, `REGISTRY_PATHS`, typed `RegistryError`, the HTTPS-only `assertAllowedRegistryUrl` guard, `parseManifest`, and the OpenAPI 3.1 document at `./openapi`).
- `@claudepad/registry` - the Cloudflare Worker reference impl (R2 blobs/sessions, KV directory/inbox) built on a storage-agnostic handler + an `InMemoryBackend` for tests/local dev.
- `@claudepad/registry-client` - the `fetch`-based `RegistryClient` SDK (any conformant registry, no hardwired URL), with a conformance suite run against the reference handler.

The client (`@claudepad/client`) now **integrates** the SDK as an opt-in, null-by-default surface (D-80): a `RegistryControl` to connect a registry URL, short-link upload + receive-by-id, share-by-name via the directory, publish-your-identity, an opt-in inbox, and consent-gated trusted-mode publish. No `claudepad.io` URL is hardwired; sharing still works with no registry; the no-external-origins gate stays green.

Still open here: real `domain`/`sso` assurance verification (the reference impl issues `self` only) and production auth (it ships reference-grade bearer auth).

## 10. Resolved design questions

- **OQ-R1 (federation/discovery across registries) - RESOLVED.** The client holds an **ordered list** of registry URLs; results are **namespaced by registry `id`**; there is **no cross-registry trust transitivity** (an `sso` assurance from registry A means nothing on registry B). A handle collision across registries is just two distinct namespaced entries; the client never merges them.
- **OQ-R2 (inbox social-graph default) - RESOLVED.** `indexFor` stays **off by default** (no graph leak); enabling it is an explicit per-put opt-in, surfaced in the UI. Stay lean - no inbox machinery beyond "list ids that carried my pub hash."
- **OQ-R3 (revocation/rotation) - RESOLVED (kept simple).** No `revokedAt`/`notAfter`, no enterprise lifecycle. Revoking access = **purge from the registry**: delete the `DirectoryEntry` (and, in trusted mode, the readable session). A `DELETE /directory/{handle}` (authn) + the existing blob/session `DELETE` is the whole story. Rotation = publish a new card under the same handle (the old one is purged). Clients always recompute the fingerprint from the served card, so a purged/rotated key simply stops resolving.
- **OQ-R4 (trusted-mode at-rest contract) - RESOLVED (kept simple).** We do **not** specify a minimum at-rest scheme. The registry **labels its posture honestly** in the manifest (`trustedAtRest`, free-text e.g. "AES-256 at rest, operator-held key") and the client shows it before a trusted publish. No conformance requirement beyond "say what you do."

## 11. Decisions

See `DECISIONS.md` **D-74** (registry = the store seam extended along the authenticity + availability axes; spec-not-service; v1 ships nothing registry-specific), **D-75** (ZK-default + opt-in trusted mode), **D-76** (directory declares per-identity assurance; client always shows assurance + fingerprint; `self` keeps the v1 fingerprint ritual), **D-77** (TLS mandatory, social-graph metadata trade-off documented). Reconciles open question **Q-10**.
