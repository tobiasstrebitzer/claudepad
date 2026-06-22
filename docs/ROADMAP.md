# claudepad - Roadmap to v1

> Drop a Claude Code session, see it beautifully, share it with one person - encrypted so only they can read it, with no server in the middle.

**Status:** P0-P4 built; P5 (launch hardening) artifacts/docs/CI shipped. The independent security review (FR-16) is **no longer a hard gate** - reclassified to a post-launch recommendation (D-78); v1.0 ships honestly labeled "unaudited, audit welcome." · **Target:** v1.0 (open-source, self-hostable, **entirely client-side**)
**Last updated:** 2026-06-22

---

## 1. Vision

`claudepad.io` turns a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, private artifact. Two promises:

- **Easy** - the fewest possible steps from "I have a session" to "here's something I can send."
- **Secure** - sharing is **trustless**: you encrypt a session *to a specific recipient's public key*, and the result is an inert blob you can drop anywhere (Slack, email, a file). Only the invited recipient can read it. No host - not even claudepad.io - can read it, because **there is no host**: v1 is entirely client-side.

It ships as an open-source project anyone can self-host (it's a static site - "self-host" means "serve some files"), with `claudepad.io` as a free hosted instance running the same code.

## 2. The serverless decision (what v1 is and isn't)

After a working proof of concept (`poc/`), v1 commits to a **pure-client, trustless** architecture (DECISIONS D-20…D-29):

**v1 IS:** identity minted in-browser (an ECDH keypair), encrypt-to-recipient sharing with per-recipient secret tiering, human-verifiable key fingerprints, optional passkey/device protection of your identity, full session prettify, and playback - **all in the browser, zero backend.**

**v1 is NOT (deferred to vNext):** any server blob store, hosted `/s/<id>` short URLs, fragment-link "share with anyone" mode, expiry / burn-after-read / revocation, an inbox to discover what's shared with you, and durable availability/pinning. These need a server or coordinated storage; we consciously trade them for trustlessness.

## 3. Principles

1. **No server, nothing to trust.** Parsing, identity, encryption, and decryption are all client-side. claudepad.io is static files. "The host can't read it" is true because there is no host in the data path.
2. **The blob is the message.** A share is a self-contained encrypted blob, carried by the user (clipboard/file). No upload, no link that points at a server.
3. **Trust is verifiable, not assumed.** A self-claimed display name is paired with a key **fingerprint** for out-of-band verification (Signal-style safety numbers).
4. **Your identity is yours.** A keypair minted and stored locally, exportable for backup, optionally locked behind your device's passkey via WebAuthn PRF. No account on anyone's server.
5. **Best-effort honesty.** Secret detection is imperfect; the threat model and the giving-up-of-features are documented in plain language, never buried.
6. **Zero-dependency crypto.** WebCrypto only for the v1 core (AES-256-GCM, ECDH P-256, HKDF, SHA-256), so it's auditable and bundles to a single static page.
7. **Inspired by Anthropic, distinct from it.** Warm-minimal, calm, fast. See `docs/prd/_context.md` → Design System.

## 4. Phases & Milestones

| Phase | Theme | Milestone | PRDs |
|-------|-------|-----------|------|
| **P0** | Foundation | Repo scaffold, design system, tolerant parser, the WebCrypto crypto core (proven by `poc/`). | PRD-01, PRD-02, PRD-05 |
| **P1** | Local Prettify (**MVP-0**) | Drop/paste a session → see it beautifully, fully offline. No identity, no sharing yet. Single static page. | PRD-03, PRD-04 |
| **P2** | Identity & Trust | Mint/import an identity, share your public key, verify keys by fingerprint, optionally protect the identity with a passkey (WebAuthn PRF). | PRD-10 |
| **P3** | Trustless Sharing (**the moat**) | Encrypt a session to a recipient at a chosen tier (body / body+secrets), output a blob (clipboard/file); recipient decrypts. Client-side secret detection + tiering. | PRD-11, PRD-06 |
| **P4** | Playback | Timeline scrubber, speed control, "presentation mode" auto-pacing. Pure client-side. | PRD-08 |
| **P5** | Launch | Static hosting + trivial self-host, docs, threat-model write-up, security review → **v1.0**. | PRD-09 |

### Suggested build order (critical path)
PRD-01 → PRD-02 → PRD-05 → PRD-03 → PRD-04 → PRD-10 → PRD-11 → PRD-06 → PRD-08 → PRD-09

P1 (PRD-01–04) is a usable offline prettifier. P2–P3 are the trustless-sharing differentiation. P4 is delight. P5 is the open-source launch.

## 5. PRD Index

| # | PRD | Phase | One-liner |
|---|-----|-------|-----------|
| 01 | Design System & UI Foundation | P0 | Anthropic-inspired tokens, shadcn/base setup, typography, theming. |
| 02 | Session Parser & Normalized Schema | P0 | Tolerant JSONL → normalized, source-agnostic session model. |
| 03 | Session Viewer & Prettified Render | P1 | The read experience: messages, markdown, code, tools, thinking. |
| 04 | Ingest & Share Output | P1/P3 | Drag-drop, paste, CLI, slash command; output a blob (clipboard/file). |
| 05 | Crypto Core & Recipient Wrapping | P0/P3 | WebCrypto AES-GCM, two content keys, ECDH-to-recipient wrap, fingerprints. |
| 06 | Secret Detection & Tiered Reveal | P3 | Scanner, review UI, opaque placeholders, per-recipient secret tier. |
| 08 | Session Playback & Presentation Mode | P4 | Timeline, speed, auto-pacing heuristic. |
| 09 | Self-Hosting (Static) & Launch | P5 | Static deploy, config, packaging, threat-model docs, security review. |
| 10 | Identity, Trust & Device Keys | P2 | Mint/import identity, fingerprints, WebAuthn-PRF device protection. |
| 11 | Trustless Recipient Sharing | P3 | The share/receive flow: encrypt-to-recipient, tiers, drop-anywhere blob. |
| ~~07~~ | ~~Backend Blob Store & API~~ | **vNext** | Deferred - kept for when an optional convenience store returns. |

Full briefs in `docs/prd/README.md`; canonical shared facts in `docs/prd/_context.md`; the crypto/identity design in `docs/TRUSTLESS-MODEL.md`. The reference implementation is `poc/` (`poc/verify.mjs` = 21-check conformance anchor).

## 6. Out of scope for v1 (vNext)

- **The entire server layer** - blob store (PRD-07), hosted short URLs, fragment-link mode, expiry/burn/revocation, inbox/discovery, pinning. (D-29.)
- **Sender authentication beyond fingerprints** - optional detached signatures / social proofs (Keybase-style).
- **Group/many-recipient sharing** with forward secrecy (MLS-style).
- **Multi-source ingest** - Codex, Gemini CLI, Cursor, etc. (PRD-02 stays source-agnostic; only Claude Code is parsed for v1.)
- **Organizations / teams / billing.**

## 7. Success metrics (v1)

- **Time-to-share** < 20s from "have a `.jsonl`" to "encrypted blob on my clipboard."
- **Trustless verifiable**: nothing is uploaded anywhere; a non-recipient provably cannot decrypt a blob (see `poc/verify.mjs`).
- **Self-host in < 5 min** by serving static files (no DB, no services).
- **Parser resilience**: renders recent Claude Code session formats without crashing; unknown fields degrade gracefully.
- **Secret recall** on a labeled test corpus ≥ a documented threshold, with false positives reviewable/dismissable.
- **Identity portability**: export/import an identity; optionally unlock it with a passkey.

## 8. Key risks

| Risk | Mitigation |
|------|------------|
| Claude Code JSONL format is undocumented & changes | Tolerant parser + normalized schema + fixture corpus (PRD-02). |
| Key authenticity (MITM on a pasted public key) | Fingerprint verification UX; honest "good for friends, not nation-states" framing (PRD-10). |
| Identity loss (cleared browser) | Exportable secret + optional synced-passkey (pattern B) recovery (PRD-10). |
| Missed secret leaks into the all-tiers body | Mandatory review-before-share UI; document best-effort limits (PRD-06). |
| Giving up availability (no host) means a blob can be "lost" | It's the user's artifact to keep; documented trade-off. Optional pinning is vNext. |
| Crypto subtlety | Zero-dep WebCrypto core, proven by `poc/`; independent security review **recommended post-launch** (D-78), with an honest "unaudited" label until then (PRD-09). |
