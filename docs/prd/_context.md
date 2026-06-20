# claudepad - Shared PRD Context (canonical)

> **Read this before writing or implementing any PRD.** It is the single source of truth for product framing, tech stack, design tokens, the security model, and the normalized data model. Individual PRDs reference these facts rather than restating them. If a PRD contradicts this file, this file wins (or this file gets updated deliberately).

---

## 1. Product in one paragraph

claudepad turns a raw Claude Code session file (`~/.claude/projects/*.jsonl`) into a clean, shareable, private artifact. Users drop or paste a session and see it prettified instantly. To share, they **encrypt it to a specific recipient's public key** - producing a self-contained blob they carry anywhere (clipboard/file). Everything (parse, redact, encrypt, decrypt) happens **client-side**; v1 has **no server**, so "the host can't read it" is true because there is no host. A two-key system lets a sharer reveal or hide embedded secrets per recipient.

## 2. Personas

- **Sharer (primary)** - a developer who just had a useful Claude Code session and wants to send it to one teammate without leaking tokens.
- **Body-only recipient** - given a blob granting the transcript only; sees the conversation with secrets redacted to placeholders.
- **Body+secrets recipient** - a trusted teammate given a blob that also reveals secret values.
- **Self-hoster** - serves the static bundle from any host; v1 needs no services, no DB, no `docker compose` (those belong to the optional store addon, vNext).

## 3. Tech stack & conventions

- **Language:** TypeScript (strict).
- **Build/Runtime:** Vite + React 18.
- **UI:** shadcn/ui built on **base-ui** primitives (Base UI, the unstyled primitives), Tailwind for styling. Prefer composing shadcn components over hand-rolled ones.
- **Crypto (v1, zero-dependency WebCrypto):** `crypto.subtle` only - **AES-256-GCM** content/wrap encryption, **ECDH P-256** identity + key agreement, **HKDF-SHA256** derivation, **SHA-256** fingerprints. No custom primitives, no `crypto-js`. `@noble/curves` enters *only* for the opt-in pattern-B deterministic identity (X25519). See `../TRUSTLESS-MODEL.md`.
- **Identity & device keys:** keypair minted client-side, stored in IndexedDB, exportable; optional **WebAuthn PRF** device protection (no server). Needs a real origin (not `file://`).
- **State:** keep it light - React state + a small store (Zustand) if needed. No data layer (no server in v1).
- **Backend:** **NONE in v1.** v1 is a static client; `claudepad.io` is static hosting. A server blob store (Cloudflare Workers + R2 + D1/KV, with a Node/Hono + Postgres + S3 self-host adapter) is **vNext** (PRD-07, DECISIONS D-29).
- **Packaging goal:** the client builds as a **single static bundle** (ideally one page) so self-hosting is "serve some files" and the crypto is auditable. The reference implementation is `poc/`.
- **Testing:** Vitest for units (parser, crypto, secret scanner are the high-value targets); Playwright for the critical share/view flows.
- **Repo conventions:** monorepo-friendly layout (`packages/` for client, shared types, CLI; `server` is vNext for the store addon). Shared types - the normalized `Session`, the `ShareBlob` (PRD-11), and the `StoreProvider` interface (`../STORE-PROVIDER-SPEC.md`) - live in one package consumed by client, CLI, and tests.

## 4. Design system (Anthropic-inspired, distinct)

> Capture the *feeling* - warm, calm, minimal, fast - without cloning it.

**North-star principle - frictionless-first: every unnecessary click is a bug.** Remove steps, prompts, and manual choices at all costs; prefer *connect-once* (not repeat-the-action), *derive-don't-ask* (read metadata from the files), and *one-surface* (not stacked chrome). Pay implementation/browser-reach cost to delete a user step, and surface the trade-off honestly (§7-style) rather than padding the UI. Embodied by the `~/.claude` folder-connect sidebar and the unified top bar. See `CLAUDE.md → Design principles` and `DECISIONS.md` D-45.

**Palette (warm neutrals + clay accent):**

| Token | Value (approx) | Use |
|-------|----------------|-----|
| `--bg` | `#FAFAF7` (paige / warm off-white) | App canvas |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--sidebar` | `#F3F2EE` (soft beige) | Sidebar / secondary surfaces |
| `--border` | `#E8E6DF` | 1px hairline borders |
| `--text` | `#1F1E1D` (warm near-black) | Primary text |
| `--text-muted` | `#6B6862` | Secondary text |
| `--accent` | `#CC785C` (Anthropic clay/terracotta orange) | Primary accent, the "spark" |
| `--accent-hover` | `#B5634A` | Hover state |
| `--success` / `--warn` / `--danger` | warm green / amber / red, low-saturation | Status |

Provide a dark theme as a token swap (warm dark, not pure black) but light is the default and the priority for v1.

**Typography:**
- **Display / headings:** a refined serif (Tiempos-like; acceptable open alternatives: *Newsreader*, *Lora*, *Source Serif*). This is the "Afternoon, Toby" greeting energy - used sparingly for hero/section headers.
- **UI / body:** a clean grotesque sans (Inter, Geist, or similar; Styrene-like). Default for all UI and transcript body.
- **Mono:** a readable mono (JetBrains Mono / Geist Mono) for code blocks and secret placeholders.

**Form language:** generous whitespace, soft radii (8–12px), 1px hairline borders over heavy shadows, restrained motion (subtle, fast easing), the clay accent used as a *spark* not a flood. Iconography: thin, rounded line icons (Lucide).

**What "distinct enough" means:** do not reuse Anthropic's exact logo, the asterisk mark, or their proprietary fonts. Build a recognizable claudepad identity (its own wordmark/mark) within the same warm-minimal family.

## 5. Security & crypto model (canonical)

> **v1 = serverless & trustless.** The authoritative design is **[`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md)** (identity, encrypt-to-recipient, fingerprints, WebAuthn-PRF device keys), proven by `poc/`. The §5.1/§5.2 framing below is updated for the no-server model; the placeholder rules (§5.3) and best-effort honesty (§5.4) are unchanged.

This is the spine of the product. Every security-relevant PRD must conform to this and to `TRUSTLESS-MODEL.md`.

### 5.1 Trustless baseline (no server)
- There is **no server** in v1. Parsing, identity, encryption, and decryption are all client-side.
- A share is encrypted **to a recipient's public key** and emitted as a self-contained **blob** the user carries (clipboard/file). Nothing is uploaded; "the host can't read it" holds because there is no host.
- Crypto: random **AES-256-GCM** content keys, wrapped via **ephemeral ECDH P-256 → HKDF-SHA256** to the recipient. A non-recipient derives a different key and AES-GCM auth fails.

### 5.2 Two-key tiered reveal (the differentiator)
The session is split into two independently-encrypted layers:
- **Body** - the transcript with secrets replaced by opaque placeholders → encrypted with **`K_body`**.
- **Secret map** - `{ S1: "sk-live-…", S2: "…" }` → encrypted with **`K_secret`**.

Tier is decided by **which content keys get wrapped to the recipient**:
- **Body-only:** wrap `K_body` (secret ciphertext omitted) → recipient sees `⟦S1⟧`-style placeholders.
- **Body+secrets:** wrap `K_body` *and* `K_secret` → recipient also decrypts the secret map and substitutes real values.

(Independent keys, D-13/D-23. In vNext server/link mode the same two keys instead ride a URL fragment - that path is deferred.)

### 5.3 Placeholder rules (important correction to the original idea)
- A placeholder is an **opaque random ID** indexing the secret map - **NOT** a hash (e.g. not `[SHA512:…]`). A hash is one-way (can't be revealed by high-priv) and, for low-entropy secrets, is brute-forceable from the public placeholder.
- For human distinguishability, render only a **type + length** label, e.g. `[AWS_KEY ••••••••(20)]`. Never expose a hash/prefix of the real value in the body.

### 5.4 Redaction is best-effort (must be surfaced, never hidden)
- Detection = known token prefixes (`sk-`, `ghp_`, AWS, JWT shapes, …) + entropy heuristics + any user-supplied `.env`/`.dev.vars` values.
- A **missed** secret stays in plaintext inside the `K_body` layer - visible to **every** recipient who can open the body. Therefore the **review-before-share UI is mandatory and load-bearing**; users confirm/adjust detections before the blob is produced.

### 5.5 Identity & trust (v1 core)
- **Identity** = client-minted ECDH P-256 keypair + self-claimed display name; exportable; no server account (PRD-10).
- **Fingerprints** (SHA-256 over the public key → emoji + hex) verify a key out-of-band - the self-claimed name asserts nothing (`TRUSTLESS-MODEL.md` §5).
- **Optional device protection** via WebAuthn PRF (no server) locks the identity at rest (PRD-10 §6).

### 5.6 Lifecycle controls - deferred (vNext)
- Expiry (TTL), burn-after-read, and revocation **require a server** and are out of scope for v1 (D-29). A shared blob is the user's artifact to keep or discard; there is no recall.

### 5.7 Honest threat-model caveats (document, don't bury)
- **No availability/recall:** no host means a blob can be lost, and cannot be expired/burned/revoked once shared (accepted trade-off).
- **Self-claimed names** are unverified; trust requires the fingerprint check, which is "good for friends," not MITM-proof.
- **Sealed-box is anonymous-sender:** the embedded sender name/fingerprint are informational, not signature-verified (optional signatures = vNext).
- **Best-effort redaction ≠ guarantee;** an unlocked private key lives in JS memory (XSS hygiene matters). See `../TRUSTLESS-MODEL.md` §7 and `../SECURITY-MODEL.md`.

### 5.8 Promoted to v1
The named-recipient model that was once "vNext, don't preclude" **is now the v1 sharing mechanism** (recipient-wrapped keys, PRD-11) - minus the server. What remains vNext: a server to *store* blobs (hosted URLs), and the server-only features (expiry/burn/revoke/inbox/pinning).

## 6. Normalized session model (shared types)

> **Authoritative spec: [`PRD-02`](./PRD-02-parser-schema.md).** PRD-02's author inspected ~60 real Claude Code session files and finalized a richer schema than the sketch below (it adds `EventBase` with `id`/`parentId`/`lane`, a `ParseResult` envelope with `diagnostics`+`stats`, `toolId` correlation, DAG `parentUuid→uuid` ordering, signed/`redacted` thinking blocks, and `SCHEMA_VERSION`). The sketch here remains a quick mental model; **where it differs from PRD-02, PRD-02 wins.** Two facts the real format forced that downstream PRDs depend on: ordering is **topo-sort → timestamp → file-order** (not pure timestamp - load-bearing for PRD-08 playback), and `tool_use`↔`tool_result` correlation uses a `toolId` (load-bearing for PRD-03).

The parser (PRD-02) converts source-specific JSONL into one normalized, source-agnostic model consumed by viewer, playback, secret scanner, and crypto. Indicative shape:

```ts
type Session = {
  id: string;
  source: 'claude-code';        // extensible later
  formatVersion: string;        // detected/best-effort
  meta: { title?: string; cwd?: string; startedAt?: string; model?: string };
  events: SessionEvent[];       // ordered, timestamped
};

type SessionEvent =
  | { kind: 'user';      ts?: string; content: ContentBlock[] }
  | { kind: 'assistant'; ts?: string; model?: string; content: ContentBlock[] }
  | { kind: 'thinking';  ts?: string; content: ContentBlock[] }
  | { kind: 'tool_use';  ts?: string; name: string; input: unknown }
  | { kind: 'tool_result'; ts?: string; forName?: string; output: unknown; isError?: boolean }
  | { kind: 'meta';      ts?: string; note: string };   // anything unrecognized, preserved

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; lang?: string; text: string }
  | { type: 'image'; ref: string }
  | { type: 'raw'; value: unknown };  // unknown blocks degrade gracefully, never crash
```

Principle: **unknown fields are preserved, not dropped, and never crash rendering.**

## 7. PRD authoring template

Every PRD (`docs/prd/PRD-0X-*.md`) follows this structure:

1. **Summary & problem** - what and why, in 3–5 sentences.
2. **Goals / Non-goals** - bulleted, explicit.
3. **Personas & user stories** - "As a … I want … so that …".
4. **UX & flows** - key screens/steps; ASCII sketches where they clarify.
5. **Functional requirements** - numbered, testable (`FR-1`, `FR-2`, …).
6. **Technical design** - architecture, key modules, libraries, trade-offs.
7. **Data model / API** - types, endpoints, schemas (where relevant).
8. **Security & privacy** - how this PRD conforms to §5; risks introduced.
9. **Dependencies** - upstream/downstream PRDs.
10. **Acceptance criteria / DoD** - checklist that defines "done."
11. **Open questions** - explicitly flagged decisions.
12. **Phase / milestone** - from the roadmap.

**Quality bar:** specific over vague; testable requirements; honest about trade-offs and unknowns; conforms to this context; cross-references sibling PRDs by number.
