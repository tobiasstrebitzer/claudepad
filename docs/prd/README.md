# claudepad - PRDs

This folder holds the product requirement documents for claudepad v1. Read [`_context.md`](./_context.md) first - canonical product framing, tech stack, design tokens, security model, normalized data model. v1 is **serverless & trustless**: see [`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md) (the crypto/identity design, proven by `../../poc/`) and [`../ROADMAP.md`](../ROADMAP.md) for phases. The optional store is an open spec, not a v1 dependency: [`../STORE-PROVIDER-SPEC.md`](../STORE-PROVIDER-SPEC.md).

> **Serverless-v1 pivot (2026-06-20):** v1 ships entirely client-side. Sharing = encrypt-to-recipient blobs carried via clipboard/file. The server, hosted URLs, fragment-link mode, and lifecycle features are deferred to a **pluggable, open-spec store addon** (DECISIONS D-20…D-33).

| # | PRD | Phase | Status |
|---|-----|-------|--------|
| 01 | [Design System & UI Foundation](./PRD-01-design-system.md) | P0 | Drafted ✓ |
| 02 | [Session Parser & Normalized Schema](./PRD-02-parser-schema.md) | P0 | Drafted ✓ (authoritative type spec) |
| 03 | [Session Viewer & Prettified Render](./PRD-03-viewer.md) | P1 | Drafted ✓ |
| 04 | [Ingest & Share Output](./PRD-04-ingest.md) | P1/P3 | Drafted ✓ (reframed: blob output) |
| 05 | [Crypto Core & Recipient Wrapping](./PRD-05-crypto-sharing.md) | P0/P3 | Drafted ✓ (reframed: primitives + wrap) |
| 06 | [Secret Detection & Tiered Reveal](./PRD-06-secrets.md) | P3 | Drafted ✓ |
| 08 | [Session Playback & Presentation Mode](./PRD-08-playback.md) | P4 | Drafted ✓ |
| 09 | [Self-Hosting (Static) & Launch](./PRD-09-selfhost-launch.md) | P5 | Drafted ✓ (reframed: static) |
| 10 | [Identity, Trust & Device Keys](./PRD-10-identity-trust-device-keys.md) | P2 | Drafted ✓ (**new**) |
| 11 | [Trustless Recipient Sharing](./PRD-11-trustless-sharing.md) | P3 | Drafted ✓ (**new**) |
| 12 | [Viewer Themes (Aesthetic Palette Axis)](./PRD-12-viewer-themes.md) | Polish | Built ✓ (**new**) |
| ~~07~~ | [Store Provider Spec & Reference Impl](./PRD-07-backend.md) | **vNext** | Deferred (open-spec addon) |

---

## Briefs

### PRD-01 - Design System & UI Foundation (P0)
claudepad visual identity + component foundation: Tailwind tokens (warm paige/white canvas, soft beige surfaces, clay-orange accent), serif-display + clean-sans + mono typography, shadcn/ui-on-base-ui, light theme (dark as token swap), Lucide icons, motion, app shell, living component gallery. Anthropic-inspired, distinct claudepad mark.

### PRD-02 - Session Parser & Normalized Schema (P0)
Tolerant parser: Claude Code `*.jsonl` (and pasted variants) → normalized, source-agnostic `Session` (authoritative type spec, grounded in ~60 real sessions). Preserves unknown fields, never crashes; DAG ordering + `toolId` correlation; fixture corpus. Source-agnostic (Claude Code only for v1).

### PRD-03 - Session Viewer & Prettified Render (P1)
The read experience / MVP-0 heart: user/assistant turns, markdown, syntax-highlighted code, collapsible tools + thinking, images, metadata; virtualized for long sessions; fully offline. Renders secret placeholders; renders sessions decrypted client-side by PRD-11. Holds no keys.

### PRD-04 - Ingest & Share Output (P1/P3)
The "easy" promise, client-side only: drag-drop, clipboard paste, first-run onboarding to `~/.claude/projects/`, a `claudepad` CLI, and a Claude Code slash command / Stop-hook. Output is a **local view or an encrypted `.cpad`** - no upload, no link in v1. Bridges local prettify into trustless sharing.

### PRD-05 - Crypto Core & Recipient Wrapping (P0/P3)
The crypto core (zero-dep WebCrypto): AES-256-GCM, ECDH P-256, HKDF-SHA256, SHA-256; two independent content keys (`K_body`/`K_secret`); the ephemeral-ECDH **recipient wrap** (sealed box); **fingerprints**. Consumed by PRD-10/11. Link grammar, lifecycle, and the store wire contract are marked **vNext**.

### PRD-06 - Secret Detection & Tiered Reveal (P3)
The moat (secrets half): client-side scanning (prefixes + entropy + user `.env` matching), mandatory review-before-share, opaque placeholders (not hashes), `{ redactedSession, secretMap }`. The secret map fills PRD-11's recipient-wrapped `secret` layer; tiering is per-recipient via key wrapping.

### PRD-08 - Session Playback & Presentation Mode (P4)
Pure client-side replay over timestamps: timeline scrubber, play/pause, variable speed, and "presentation mode" auto-pacing (dwell ∝ length, collapse idle, fold tool-spam). Builds on PRD-03; works on any decrypted session.

### PRD-09 - Self-Hosting (Static) & Launch (P5)
The open-source v1.0 launch: build → **static bundle** → any host (self-host == hosted, trivially). Small config (optional `STORE_URL`, default empty - no store code in v1), public threat-model docs, the gating independent security review (PRD-05/06/10/11), licensing, contributor/release process, CI/CD, launch checklist.

### PRD-10 - Identity, Trust & Device Keys (P2) - new
Client-side identity: mint/import/export an ECDH P-256 keypair + display name (no account); public-key card; **fingerprint** verification (your key, a recipient's, a blob's sender); optional **WebAuthn-PRF device protection** (pattern A default, B opt-in). Three states (none/locked/unlocked). Proven in `poc/`.

### PRD-11 - Trustless Recipient Sharing (P3) - new
The headline: encrypt a session **to a recipient's public key** at a chosen tier (body / body+secrets) → a self-contained `cp-blob` carried via clipboard/`.cpad` (drop anywhere). Receive/decrypt at the granted tier; verify sender by fingerprint; non-recipients are locked out by the math. Defines the blob format. Proven in `poc/`.

### PRD-12 - Viewer Themes (Aesthetic Palette Axis) - new
An aesthetic **palette axis** (`data-viewer-theme`) orthogonal to functional light/dark. 4 palettes - `warm` (default), `slate`, `ocean`, `contrast` - each a token-override block in `tokens.css` per mode, gated by `check-contrast` (palette × mode). Global + persisted; chosen from a single **Appearance** popover (mode + palette). Chrome only - code stays on the github light/dark Shiki pair.

### PRD-07 - Store Provider Spec & Reference Implementation (vNext, deferred)
**Not in v1.** The optional store is an **open HTTP contract** for a zero-knowledge blob store + a reference implementation at `claudepad.io/store` (Bitwarden/Headscale model - a spec, not a service). Adds convenience (short URLs) and optional lifecycle without changing the trust model. v1 ships only the `StoreProvider` seam ([`../STORE-PROVIDER-SPEC.md`](../STORE-PROVIDER-SPEC.md)); this PRD's endpoint/storage design is the blueprint for the reference impl.
