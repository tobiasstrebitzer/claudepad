# claudepad — Decisions Log

> Running record of decisions made (and key open questions) so future work doesn't re-litigate them. Newest at top of each section.

## Resolved

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | **Zero-knowledge by default**; all crypto/redaction client-side; server is a dumb blob store. | Makes "host can't read it" an architectural property, not a promise. |
| D-2 | **Link-in-URL-fragment sharing is the default** (PrivateBin model). Named-recipient/PGP mode is vNext, opt-in. | Frictionless, no accounts; matches the "easy" goal. User explicitly disliked mandatory login + explicit sharing. |
| D-3 | **Two-key tiered reveal**: separate `K_body` (redacted transcript) and `K_secret` (secret map). | Cryptographic, not UI-level, separation of trust tiers. |
| D-4 | **Opaque random placeholders, not hashes.** Display type+length only. | Hashes are one-way (no high-priv reveal) and brute-forceable for low-entropy secrets. Corrects the original `[SHA512:…]` idea. |
| D-5 | **Review-before-share is mandatory.** Never auto-publish. | Redaction is best-effort; a missed secret leaks to all tiers. The human review step is load-bearing. |
| D-6 | **Strict (zero-knowledge) mode only for v1.** Convenience/non-ZK mode deferred. | Server-side search/scan would break zero-knowledge; lead with the trust story. |
| D-7 | **Tech stack:** TypeScript + Vite + React, shadcn/ui on base-ui, Tailwind, Web Crypto API. | Per product owner. |
| D-8 | **Backend:** Cloudflare Workers + R2 + D1/KV, with a Node/Hono + Postgres + S3 adapter for self-host parity. | Cheap free tier; storage-agnostic tiny API; easy self-host. |
| D-9 | **Design language:** Anthropic-inspired warm-minimal (paige/white canvas, clay-orange accent, serif display + clean sans), but a distinct claudepad identity (own mark/fonts). | Per product owner + reference image. |
| D-10 | **Parser produces a normalized, source-agnostic session model;** unknown fields preserved, never crash. | Claude Code JSONL is undocumented and changes; resilience over completeness. |
| D-11 | **Client should build as a single static bundle** where feasible. | Auditability + trivial self-hosting (mirrors successful prior-art viewers). |
| D-12 | **Claude Code only for v1 ingest;** schema kept multi-source ready. | Focus; avoid premature breadth (Codex/Gemini are vNext). |
| D-13 | **Independent content keys** — `K_secret` is NOT derivable from `K_body` (no key hierarchy). | A forward hierarchy would let every low-priv holder derive the high-priv key → tier collapse. Independent keys are simpler to audit and map cleanly onto vNext per-recipient wrapping. (PRD-05 §6.3, resolves Q-2.) |
| D-14 | **Default expiry 7 days** (options `1h/1d/7d/30d`); **burn-after-read offered, default OFF, whole-envelope** (no per-tier burn). | Short-lived share links; 7d survives "teammate opens it Monday." Per-tier burn would need per-layer server lifecycle (racey, more surface). (PRD-05 §6.6, resolves Q-3.) |
| D-15 | **CLI + custom slash command ship in v1** as the one-keystroke path; the **Stop-hook is documented but opt-in / off by default.** | An always-on auto-upload-on-stop is a privacy footgun and conflicts with D-5 (never auto-publish silently). (PRD-04, resolves Q-6.) |
| D-16 | **No `never` expiry in hosted v1;** TTL is bounded. Self-host MAY raise `MAX_TTL`. | Bounds storage/abuse on the hosted instance. (PRD-07 FR-5; reconciled with PRD-05.) |
| D-17 | **Client-initiated delete requires a capability `deleteToken`** returned once at create time (stored only as a SHA-256 hash server-side). | Knowing the public `id` must not let a griefer delete others' blobs. (PRD-07 FR-17.) |
| D-18 | **API-contract ownership split:** **PRD-07 owns the HTTP surface & lifecycle transport** (`POST /v1/blobs` octet-stream body + `Cp-*` headers, `GET /v1/blobs/:id`, `GET /v1/blobs/:id/meta` peek, `/s/:id` serves the SPA shell); **PRD-05 owns the envelope bytes & link/key grammar.** | Resolves a divergence found in consolidation (PRD-05 had drafted its own `/api/blobs` JSON shape + `HEAD ?peek=1`). PRD-05 §7.4 was rewritten to defer to PRD-07. |
| D-19 | **Q-4 — bias secret detection toward recall** with easy one-click dismissal; suppressors down-rank rather than silently drop. | A missed secret leaks to all tiers (worse than a false positive the user can dismiss in the mandatory review). (PRD-06.) |

## Consolidation reconciliations (2026-06-20 review pass)

Cross-PRD inconsistencies found while reviewing the nine drafts and how they were resolved:

1. **Wire contract (PRD-05 ↔ PRD-07).** PRD-05 had drafted a JSON-wrapped `POST /api/blobs` body, a `meta.expiry` enum incl. `never`, fetch at `GET /s/:id`, and `HEAD ?peek=1`. PRD-07 (the API owner) specifies an `application/octet-stream` body with `Cp-*` headers, `POST /v1/blobs`, `GET /v1/blobs/:id`, `/meta` peek, and `/s/:id` as the SPA shell. → **PRD-05 §7.4/FR-20/§4.1/§4.2/§6.6/Q-3 edited to match PRD-07.** (D-18.)
2. **Default TTL.** PRD-05 said 7d; PRD-07 said 30d. → **Standardized on 7d** (`DEFAULT_TTL=604800`s); PRD-07 FR-2 updated. (D-14.)
3. **`never` expiry.** PRD-05 offered it; PRD-07 forbade it. → **Removed from hosted v1**, self-host config-gated via `MAX_TTL`. (D-16.)
4. **`deleteToken`.** PRD-07 introduced it; PRD-05's `CreateResponse` didn't have it. → **PRD-05 `CreateResponse` updated** to include `deleteToken`/`url`. (D-17.)
5. **Type-spec authority.** PRD-02 finalized a richer schema than `_context.md` §6's sketch. → **`_context.md` §6 now defers to PRD-02** as authoritative.

## Serverless-v1 pivot (2026-06-20) — supersedes where noted

After brainstorming identity-based sharing and **building a working proof of concept (`poc/`)**, v1 is re-scoped to be **entirely client-side**. The recipient-encrypted-blob model needs no server, so we trade server-dependent features for true trustlessness. These decisions take precedence over the earlier "Hosted Sharing (P2)" framing.

| # | Decision | Rationale |
|---|----------|-----------|
| D-20 | **v1 is entirely client-side (serverless).** `claudepad.io` ships as a static site; no backend, no accounts, no hosted URLs. | The trustless blob model needs no server. Trustlessness + zero-ops self-host > server-only features. (User decision, 2026-06-20.) |
| D-21 | **Primary sharing model = trustless recipient-encrypted blobs.** Sender encrypts to the recipient's public key; the blob *is* the message, carried via clipboard/file — "drop it anywhere, only the invited person can read it." | Proven in `poc/` (16/16 crypto checks). No host can read or gatekeep. |
| D-22 | **Identity = client-minted ECDH P-256 keypair** + self-claimed display name; exportable secret; no server account. | P-256 has zero-dependency WebCrypto support (X25519 needs a lib). Pseudonymous, Nostr-like. X25519 documented as the alt. |
| D-23 | **Per-recipient tiering via key wrapping.** Independent `K_body`/`K_secret` (D-13) are wrapped to each recipient's pubkey; `wrappedSecret` included only for high-priv recipients. | Replaces the two-fragment-link tiering for v1; cleaner (one blob, per-person tier) and falls out of the recipient model. |
| D-24 | **Ephemeral sealed-box per share** (ephemeral ECDH keypair → HKDF-SHA256 → AES-256-GCM wrapping key). Sender identity embedded for display. | Unlinkable recipient sets across shares + forward secrecy on the wrap. |
| D-25 | **Key fingerprints** (SHA-256 over the raw public key → 6 emoji + 8-hex code) for out-of-band trust. | The name is self-claimed; a short human-comparable fingerprint is the Signal-style verification (mitigates MITM-on-pubkey). |
| D-26 | **Optional device protection via WebAuthn PRF (pattern A default).** Passkey/security-key PRF output derives a KEK that wraps the stored private key — client-side only, no server. PRF evaluated **at registration** to avoid a double prompt. | Hardware-gated identity at rest, no backend. Pattern B (PRF-as-seed → multi-device via synced passkeys) documented; needs `@noble/curves` for deterministic keygen. Exported secret stays the recovery fallback. |
| D-27 | **Crypto core stays zero-dependency WebCrypto** for v1 (AES-256-GCM, ECDH P-256, HKDF-SHA256, SHA-256). | Auditability + single-static-bundle goal. `@noble/curves` enters only if pattern-B identity ships. |
| D-28 | **`poc/` is the reference implementation** of the crypto/identity/sharing core; `poc/verify.mjs` (16 checks) is the conformance anchor for the production code. | De-risks the spec; PRDs describe what the PoC already proves. |
| D-29 | **Deferred to vNext (consciously giving up):** server blob store (PRD-07), hosted `/s/<id>` short URLs, fragment-link/`#key` mode, expiry/TTL, burn-after-read, revocation, inbox/discovery, availability/pinning. | These all require a server or mutable/coordinated storage. Re-introduce only as an optional convenience layer later. |

**Status changes from the pivot:** **D-14, D-16, D-17, D-18** (server lifecycle, wire contract, delete tokens) are **moot for v1** and retained only for the vNext backend. **PRD-07** is **Deferred (vNext)**. **PRD-05** is re-scoped from "link-mode crypto + backend wire contract" to "client crypto core & recipient wrapping." Fragment-link grammar moves to vNext.

## Pluggable store as an open spec (2026-06-20)

The backend, when it returns, is an **optional, opt-in addon defined by an open contract** — not a proprietary service. Model: Bitwarden (self-host the server, point the client at any URL) / Tailscale↔Headscale (open protocol, reference control server).

| # | Decision | Rationale |
|---|----------|-----------|
| D-30 | **The store is a SPEC, not a service.** "PRD-07" is re-scoped to the **Store Provider Specification** (an open HTTP contract for a zero-knowledge blob store) plus a **reference implementation** hosted at `claudepad.io/store`. Any org can implement the spec; trusting users can point at `claudepad.io/store`. | Avoids vendor lock-in; the value is the open contract. `claudepad.io/store` is *one* implementation, free & open-source. |
| D-31 | **The store is a pluggable, opt-in addon.** Default = **no store** (pure client). A store is configured by URL (self-host, org, or `claudepad.io/store`); the bundle calls it only through the `StoreProvider` interface. | Keeps the root bundle pure; users choose if/whom to trust with hosting their (already-encrypted) blobs. |
| D-32 | **v1 ships the clean seam, not the store.** The static bundle defines the `StoreProvider` interface and a default **`NoStoreProvider`** (everything stays client-side); **no provider implementation and no `claudepad.io/store` URL or store-specific code** ship in v1. | v1 has zero store dependency and can launch without it, while the integration point exists so the addon drops in later without re-architecture. |
| D-33 | **No `claudepad.io/store`-specific code or mentions in the v1 client.** The store URL is runtime/build config with default empty; the core is store-agnostic. | The store must remain a swappable spec implementation, never hardwired. |

### P0 implementation decisions (made while scaffolding the monorepo, 2026-06-20)

These record where the **as-built** stack deviates from the intended-stack sketch in `_context.md` §3 / the PRDs. None change product behavior; each was the lower-risk path against the current (mid-2026) ecosystem.

| # | Decision | Why |
|---|----------|-----|
| D-34 | **Tailwind v4 (CSS-first `@theme`)** instead of the v3-style `tailwind.config.ts` PRD-01 §6.2 sketched. Semantic tokens map to utilities in `globals.css`; `tokens.css` stays the single hex source. | v4 is the current major and its CSS-variable-first model is a *closer* fit to PRD-01's "CSS-variable token system" (FR-1/FR-2) than a JS config. Theme swap is still a pure `data-theme` flip (FR-3). |
| D-35 | **React 18 retained** (per `_context.md` §3) even though React 19 is current; toolchain otherwise current: **Vite 8, @vitejs/plugin-react 6, Vitest 4** (single Vite across app + tests). | Honors the PRD's React-18 call; Vitest 2 (which bundles Vite 5) clashed with Vite 8 + plugin-react 6, so the runner was aligned up to Vitest 4 to keep one Vite. |
| D-36 | **shadcn primitives hand-composed in-repo** on Base UI (`@base-ui-components/react`) with `cva` + token Tailwind, rather than run through the shadcn CLI. | This *is* the shadcn ownership model (components live in `src/components/ui/`, editable in-repo — PRD-01 §6.3); the CLI needs interactive/registry setup that doesn't cleanly target Base UI rc + Tailwind v4. |
| D-37 | **Fonts self-hosted via `@fontsource`** (Newsreader/Inter/JetBrains Mono), bundled by Vite. | Satisfies FR-7 "self-hosted, no third-party font CDN at runtime / no-phone-home" without hand-managing woff2 files; resolves Q-B's leaning. |
| D-38 | **Accent contrast: keep the exact clay `--accent` (#CC785C); hold text-on-accent to AA-large 3:1**, used only for large/bold button labels. `--warn` darkened #C28A3A→#B87F30 to clear 3:1 on canvas. | White-on-clay is 3.28:1 (< 4.5 small-text AA) but ≥ 3:1 (AA-large); the approved warm-clay look is preserved and the one relaxation is documented + enforced by `scripts/check-contrast.mjs` (FR-21). |
| D-39 | **As-built package layout:** `@claudepad/schema` (parser, PRD-02), `@claudepad/shared` (crypto core, PRD-05 §6.10), `@claudepad/client` (PRD-01). No `cli` package yet (lands with PRD-04). | Crypto lives in `shared` per PRD-05 §6.1; the schema parser is its own zero-dep leaf per PRD-02 FR-29. |

### P1 implementation decisions (MVP-0: viewer + ingest, 2026-06-20)

| # | Decision | Why |
|---|----------|-----|
| D-40 | **The SessionViewer (PRD-03) lives inside `@claudepad/client`** (`src/viewer/**`), not a standalone `packages/viewer`. | It composes the client's PRD-01 design tokens/primitives; a separate package would invert the dependency (client→viewer) and duplicate the token layer. Turn components stay pure (event + flags) so PRD-08 playback can still wrap them. |
| D-41 | **`@claudepad/ingest`** holds the pure, isomorphic ingest helpers (shape `classify`, OS onboarding paths, size caps); the React surfaces (drop/paste/onboarding/banner) live in the client. | Matches PRD-04 §6.1 — the pure helpers are unit-testable and reused by the CLI later; only the browser wiring is client-specific. |
| D-42 | **Provisional secret-placeholder token** = `⟦cp-secret:<id>:<TYPE>:<len>⟧`, carrying only id/type/len (never any substring/hash of the value). The viewer renders it as `[<TYPE> ••••••••(len)]`. | PRD-06 isn't built; PRD-03 only renders placeholders. This is the documented contract PRD-06 must emit (or update here deliberately). react-markdown can't override text nodes, so chips are injected via a rehype transform that runs **after** sanitize. |
| D-43 | **Shiki via the fine-grained core** (`shiki/core` + `@shikijs/langs/*` explicit grammar imports) with the **pure-JS regex engine** (no oniguruma wasm), single `github-light` theme, curated ~13-lang subset. | Resolves PRD-03 Q-3: the default full `shiki` bundle emitted 100+ unused grammar chunks + a 622 KB wasm; the fine-grained core cuts that to ~13 lazy lang chunks and removes the wasm, keeping the auditable single-bundle/offline posture. A dark code theme is a follow-up. |
| D-44 | **No persisted session history in v1** (FR-18): the sidebar "recent" list is illustrative until an opt-in local cache lands (PRD-04 OQ-D). Sharing is surfaced-but-disabled (P3). | Local-only by default; nothing is written to storage beyond the theme preference. |

## Open questions (carry into PRDs)

Resolved during the consolidation pass: **Q-2→D-13, Q-3→D-14/D-16, Q-4→D-19, Q-6→D-15.** Still open:

| # | Question | Owner PRD | Leaning |
|---|----------|-----------|---------|
| Q-1 | Single auditable static HTML vs. full SPA for the client shell? | PRD-01/03 | Lean single-bundle static (PRD-01 §6.1 resolved for the design foundation); final routing mechanics deferred to PRD-03. |
| Q-5 | Presentation-mode pacing heuristic specifics (reading speed, idle-gap collapsing, tool-spam folding)? | PRD-08 | Concrete algorithm proposed (PRD-08 §6.3); treat numbers as data, tune on a labeled corpus. |
| Q-7 | **Anchor/message `id` stability** across parser re-runs & format-version bumps (so shared deep links survive). | PRD-02 ↔ PRD-03/05 | Needs a stable id derivation in PRD-02's output contract. High priority — shapes the share format. |
| Q-8 | **Canonical source for tool results** — top-level `toolUseResult` vs. inline `tool_result`; and the `tool_use`↔`tool_result` tie-break for parallel/interleaved calls. | PRD-02 ↔ PRD-03 | Pick one canonical, preserve the other in `raw`. |
| Q-9 | **`preserveRaw` on the share path** — keeping unknown `raw` fields aids fidelity but bloats (and could smuggle un-scanned plaintext past PRD-06). | PRD-02 ↔ PRD-05/06 | Lean: strip/scan `raw` before encrypting the body; confirm. |
| Q-10 | _(deferred with the backend)_ Secret-layer presence side channel — moot until a server exists. | vNext PRD-07 | Revisit when/if the store ships. |
| Q-11 | **License:** MIT vs. Apache-2.0 (patent grant matters for crypto). | PRD-09 | Lean MIT; Apache-2.0 documented alternative; AGPL rejected. |
| Q-12 | **Independent security reviewer** selection/scope/budget/timeline (gates v1). | PRD-09 | Unassigned — on the critical path. Now covers the identity/recipient crypto (PRD-05/10/11). |

### New (serverless pivot)
| # | Question | Owner PRD | Leaning |
|---|----------|-----------|---------|
| Q-14 | **Multi-recipient blob format** — one blob carrying grants for N recipients vs. one blob per recipient. | PRD-11 | One blob, an array of per-recipient wrapped-key entries (trial-unwrap on open); per-recipient blob as the simple fallback. |
| Q-15 | **Identity portability default** — pattern A (device-bound, zero-dep) vs. pattern B (PRF-seed, multi-device via synced passkeys, needs `@noble`). | PRD-10 | A as default; B as an opt-in "roam to my devices" mode. |
| Q-16 | **Large-blob ergonomics** — big sessions make clipboard blobs unwieldy; file (`.cpblob`) download/upload as the path for large ones. | PRD-04/11 | Auto-switch to file above a size threshold; keep clipboard for small. |
| Q-17 | **Fingerprint encoding** — final emoji palette + code length; accessibility (color/emoji-blind users get the hex code). | PRD-10 | Lock the 64-emoji set + 8-hex; always show the hex too. |
| Q-18 | **Sender authenticity beyond fingerprints** — optional signature so a recipient can cryptographically verify the sender (not just a self-claimed name). | PRD-11 (vNext-candidate) | Sealed-box is anonymous-sender; add an optional detached signature later. |

## vNext backlog (post-v1)

**Deferred by the serverless-v1 pivot (D-29):**
- Server blob store (PRD-07) + hosted `/s/<id>` short URLs.
- Fragment-link / `#key` "share with anyone (no identity)" mode — requires a store to point at.
- Lifecycle: expiry/TTL, burn-after-read, revocation.
- Inbox / discovery ("everything shared with me") — needs an index or relay.
- Durable availability / pinning (IPFS/web3.storage/bucket).

**From earlier brainstorming:**
- Sender-authenticated sharing (detached signatures / social proofs, Keybase-style).
- Group sharing (MLS-style) for many recipients with forward secrecy.
- Multi-source ingest (Codex, Gemini CLI, Cursor, …).
- Organizations / teams.
