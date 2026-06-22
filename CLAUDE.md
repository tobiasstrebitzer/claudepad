# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**claudepad** turns a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, private artifact. You drop/paste a session, see it prettified, and - to share - **encrypt it to a specific recipient's public key**, producing a self-contained blob you can drop anywhere (Slack, email, a file). Only the invited recipient can read it.

Open-source and self-hostable, with `claudepad.io` as a free hosted instance running the same code.

## Design principles

**Frictionless-first - every unnecessary click is a bug.** claudepad's job is to get a session in front of you with the least possible ceremony. If there's a way to remove a step, a prompt, or a manual choice, we find it and take it - *even when it costs implementation effort or browser reach*. This is a north star, not a nicety. When building or reviewing any flow, count the clicks and decisions a user must make and drive both toward zero:

- **Connect-once, not repeat-the-action.** The File System Access folder-connect grants `~/.claude` a single time → the sidebar lists every project/session, no re-upload.
- **Derive, don't ask.** Read titles/branch/cwd from the session files themselves (`ai-title` etc.) rather than making the user name or pick things.
- **One surface, not stacked chrome.** A single top bar does breadcrumbs + context + actions, not three stacked rows.
- **Pay to delete a step.** Accept a narrower-browser or more-code cost to remove user friction; surface the trade-off honestly (see `TRUSTLESS-MODEL.md` §7) instead of padding the UI.

**Name for intent, not mechanism.** Names are the cheapest design surface - the code should read like the product. Name a thing for the *experience or outcome* a user gets, not the *action or input/output* a function performs. The axes (left wins):

- **Intent / Outcome › Input / Output** - `SessionExperience`, not `JsonlRendererController`.
- **Experience › Action** - "connect your folder", not "register a directory handle"; "explore a sample", not "load demo fixture".
- **What it's *for* › what it *is*** - `vault` (a place your sessions live), not `FileSystemDirectoryHandleStore`.

If a name describes plumbing, rename it after the user-facing intent - and if you can't, that's often a smell that the abstraction is at the wrong altitude.

## Project status (2026-06-21)

**P0 + P1 + P2 + P3 + P4 built; P5 launch hardening in progress.** The production monorepo is scaffolded and the first five ROADMAP phases are done and committed:

- **P0 (Foundation):** `@claudepad/schema` (tolerant parser, PRD-02), `@claudepad/shared` (zero-dep WebCrypto core mirroring `poc/`, PRD-05), and `@claudepad/client` design system (tokens, AppShell, primitives on Base UI, `/gallery`, PRD-01).
- **P1 (MVP-0):** drop/paste a session → prettified `SessionViewer` (PRD-03, in `client/src/viewer/`) fed by `@claudepad/ingest` (PRD-04). Fully offline, local-only; sharing is surfaced-but-disabled until P3.
- **Post-P1 (frictionless UX, D-46…D-48):** optional File System Access **folder-connect** - grant `~/.claude` once and the sidebar lists every project/session (titles/branch/size read from the file tail, read-only, Chromium-only) - plus a **unified top bar** (breadcrumbs + context + actions in one surface). `client/src/fs/**` + `@claudepad/ingest` `extractSessionMeta`.
- **P2 (Identity & Trust, PRD-10):** mint/import a client-side ECDH P-256 identity, persisted in IndexedDB; a `none → locked → unlocked` state machine; public-key card (`cp-pub-…`) + identity secret (`cp-id-…`) export; human-verifiable **fingerprint** (emoji + hex); optional **WebAuthn-PRF device protection** (pattern A, wraps the identity at rest). Lives in `client/src/identity/**`; the trust UI is a one-click sidebar-footer popover (D-51). Consumes the already-proven `@claudepad/shared` crypto.
- **P3 (Trustless Sharing - the moat, PRD-11 + PRD-06):** the headline. A new **`@claudepad/secrets`** package (pure scanner + redactor: prefix/entropy/.env signals, suppressors, opaque `⟦cp-secret:id:TYPE:len⟧` placeholders, body+secret-map split). The client **share flow** (`client/src/share/**`) is a 4-step dialog - mandatory secret **review** → recipient key + **fingerprint confirm** → **tier** (body / body+secrets) → `cp-blob-…` output (auto-copy + `.cpad`). **Receive** pastes/uploads a blob, decrypts with the current identity (fail-closed for non-recipients), shows the sender's fingerprint, and hands the session to the viewer (body+secrets feeds high-priv reveal). Crypto = the already-proven `createBlob`/`openBlob`. **Deferred (D-58, IDEAS.md):** Web-Worker scan, labeled-corpus recall numbers, advanced review (edit-span/merge/sensitivity slider), multi-recipient single blob.

- **P4 (Playback - the delight layer, PRD-08):** a pure timeline engine in **`@claudepad/client` `client/src/playback/**`** - `buildTimeline(session, mode, cfg)` over the viewer's render rows (realtime + presentation pacing, idle-collapse, tool-spam fold, **fast-track of thinking/meta**; FR-1/2/9–13), with a rAF clock (`PlaybackProvider`, single monotonic virtual playhead) and pure `resolveFrame`/seek/step derivations. UI = an **in-flow transport bar** (AppShell footer, right of the sidebar - play/pause, prev/next, ARIA-slider **scrubber** with kind-colored ticks + collapsed-gap bands) with a **settings popover** (pacing mode, speed, **appear: instant/type**, reading-speed), a **keyboard map** + help, and **deep-link** query params (`?play=1&mode=present&speed=1.5&appear=type`, never the key fragment). Integrates into the viewer with **progressive reveal + active highlight (reuses PRD-03's `highlighted` ring) + scroll-to-active + opt-in typing reveal** (only the active turn types, paced to its dwell), reduced-motion-aware - no render fork. Pure client-side, zero network. **Deferred (D-59/D-60, IDEAS.md):** in-transcript "ran X ×k"/"N min later" affordances (folding/idle are in the timeline + scrubber), ghosted previews, pacing tuning + ≥5k-event perf smoke.

**As-built stack** (deviations from the intended-stack sketch are recorded in `docs/DECISIONS.md` D-34…D-44): pnpm workspaces · TS strict · React 19 · **Vite 8 + Tailwind v4 (CSS-first)** · **Vitest 4** · Playwright · shadcn-style primitives hand-composed on Base UI · self-hosted fonts via `@fontsource` · Shiki fine-grained core (no wasm). Gate: `pnpm check` (typecheck + lint + no-raw-hex + WCAG contrast + tests + `poc/verify.mjs`).

- **P5 (Self-Hosting & Launch, PRD-09 - serverless scope, D-66…D-70):** the v1 deploy path was already shipped (Vite build → `packages/client/dist`, served by anything; `claudepad.io` via `packages/client/wrangler.jsonc`). P5 adds the launch *artifacts*: `LICENSE` (MIT, D-67), public plain-language `docs/THREAT-MODEL.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, rewritten `README.md`, `docs/self-hosting.md`, `docs/verify-zero-knowledge.md` + `scripts/check-no-external-origins.mjs` (ZK is reproducible, D-68), and CI/CD (`.github/workflows/{ci,release}.yml`; tag → bundle + SHA-256 + `wrangler` deploy, D-70). PRD-09's docker/Postgres/MinIO/Workers-R2 stack stays **vNext** (the optional store addon). 

**Next:** the **independent security review** (FR-16 / Q-12, D-69) is the one remaining hard gate before the v1.0 tag - an external-vendor task; everything else for P5 is in place.

**Post-launch polish - Viewer Themes (PRD-12, D-71…D-73, built 2026-06-22):** an aesthetic **palette axis** (`<html data-viewer-theme>`) orthogonal to functional light/dark. 4 palettes (`warm` default, `slate`, `ocean`, `contrast`), each a token-override block in `tokens.css` per mode; `lib/viewer-theme.ts` mirrors `lib/theme.ts` (global + persisted, no-flash boot). One **Appearance** popover (`components/shell/AppearanceMenu.tsx`) holds mode + palette, replacing the old `ThemeToggle`. `check-contrast` validates every palette × mode; chrome only (code keeps the github light/dark Shiki pair).

The repo also contains the finalized **PRD set** (`docs/`) and the **proof of concept** (`poc/`, the crypto reference; `poc/verify.mjs` stays green).

## The one decision that shapes everything: v1 is serverless & trustless

v1 is **entirely client-side**. There is **no backend**. "The host can't read it" is true because there is no host. Sharing = encrypt-to-recipient → blob carried by the user.

**In v1:** session parsing & prettify · client-minted identity (ECDH P-256 keypair, no account) · encrypt-to-recipient sharing with per-recipient secret tiering · key fingerprints for trust · optional WebAuthn-PRF device protection of the identity · playback. All in the browser.

**Deferred to vNext (consciously giving up):** any server/blob store, hosted `/s/<id>` URLs, fragment-link "share with anyone" mode, expiry / burn / revocation, inbox/discovery, pinning. When a store returns it is an **optional, opt-in addon defined by an open spec** (Bitwarden/Headscale model) - `claudepad.io/store` would be just a reference implementation. **Never put store-specific code or a `claudepad.io/store` URL in the v1 client.**

See `docs/DECISIONS.md` D-20…D-33 for the full rationale.

## Where things live

```
docs/
  ROADMAP.md            # phases P0–P5 to v1, build order, success metrics
  IDEAS.md              # running idea / future-task tracker (e.g. Show HN launch)
  CONCEPT.md            # the idea + prior-art / competitive landscape
  TRUSTLESS-MODEL.md    # ★ canonical v1 crypto/identity design (proven by poc/)
  SECURITY-MODEL.md     # threat-model framing (link/lifecycle sections = vNext)
  STORE-PROVIDER-SPEC.md# the pluggable-store seam (open spec; store = vNext)
  DECISIONS.md          # ★ decision log (D-1…D-49) + open questions + vNext backlog
  prd/
    _context.md         # ★ canonical shared facts (tech stack, tokens, security, schema)
    README.md           # PRD index + briefs
    PRD-01 … PRD-11     # the PRDs (see index below)
poc/
  trustless-share.html  # ★ runnable PoC: identity, encrypt-to-recipient, tiers, fingerprints, WebAuthn-PRF
  verify.mjs            # 21-check headless crypto conformance anchor (`node poc/verify.mjs`)
  README.md             # how to run (incl. localhost for WebAuthn)
```

★ = read these first.

### PRD index
- **01** Design System · **02** Parser & Schema · **03** Viewer · **04** Ingest & Share Output · **05** Crypto Core & Recipient Wrapping · **06** Secret Detection & Tiered Reveal · **08** Playback · **09** Self-Hosting (Static) & Launch · **10** Identity, Trust & Device Keys · **11** Trustless Recipient Sharing.
- **07** (Store Provider Spec & Reference Impl) is **vNext / deferred** - not v1.

## The PoC is the reference implementation

`poc/` already proves the crypto/identity/sharing core. Production code should mirror it and keep `poc/verify.mjs` green.

- **Crypto (zero-dependency WebCrypto):** AES-256-GCM (content/wrap), ECDH **P-256** (identity + key agreement), HKDF-SHA256 (derivation), SHA-256 (fingerprints). No custom primitives, no `crypto-js`.
- **Share = ephemeral sealed box:** per share, generate an ephemeral ECDH keypair; `KW = HKDF(ECDH(eph, recipientPub))`; wrap two **independent** content keys `{ K_body, K_secret? }` under `KW`; encrypt body with `K_body`, secret map with `K_secret`. Tier = which keys you wrap (body-only omits the secret layer).
- **Fingerprint:** `SHA-256(rawPublicKey)` → 6 emoji (palette of 64) + 8-hex code; shown for your key, a recipient's, and a blob's sender.
- **Device keys:** WebAuthn **PRF** extension as a local key oracle (no server). Pattern A (default) = PRF output → KEK that wraps the stored private key. PRF evaluated **at registration** to avoid a double prompt. Needs a real origin (not `file://`).
- Run the PoC over localhost for WebAuthn: `cd poc && python3 -m http.server 8782` → `http://localhost:8782/trustless-share.html`. Verify crypto: `node poc/verify.mjs`.

## Intended tech stack (for the monorepo, next session)

TypeScript (strict) · Vite + React 19 · shadcn/ui on base-ui + Tailwind · WebCrypto (zero-dep core; `@noble/curves` only if the opt-in multi-device "pattern B" identity ships) · Vitest + Playwright. Target a **single static bundle** (self-host = serve files). Planned layout: `packages/{client, shared, cli}` (no `server` in v1).

## Working conventions

- **Conform to the canonical docs.** If a PRD conflicts with `docs/prd/_context.md` or `docs/TRUSTLESS-MODEL.md`, those win (or update them deliberately and note it in `DECISIONS.md`).
- **Keep the crypto zero-dependency and auditable.** Don't introduce a crypto lib for the v1 core.
- **No server assumptions.** Every flow must work fully offline. No `claudepad.io/store` URL or store code in the client (D-33).
- **Honesty over polish in security claims.** Surface trade-offs (no recall/expiry, self-claimed names, best-effort redaction) - see `TRUSTLESS-MODEL.md` §7.
- **Design language:** warm-minimal (paige/white canvas, clay-orange accent), serif display + clean sans, per `_context.md` §4 - Anthropic-inspired but a distinct claudepad identity.
- Some PRD sections (PRD-05 §4/§7.3/§7.4/§6.6, PRD-07 entirely, parts of PRD-09) describe the **vNext** link/store path and are explicitly banner-tagged - don't implement them for v1.
- Commits and PR's should not include Claude as a co-author. I openly communicate that I work with AI (and give you credit), however having a co-authored commit raises alarm, as some users don't carefully review changes made by AI.
- Always avoid Em-Dashes (`—`). Try to avoid it, and if needed, use a regular dash.
- Avoid using too verbose comments. I prefer readable code over comments.

## Wrapup Config

- check: `pnpm check` (typecheck + lint + no-raw-hex + WCAG contrast + tests + `poc/verify.mjs`)
- test: `pnpm test` (covered by `check`)
- frontend_smoke: yes - `pnpm --filter @claudepad/client run test:e2e` (Playwright)
- push: yes - remote `origin` = `https://github.com/tobiasstrebitzer/claudepad`
- version_bump: yes (aligned across all packages; pre-1.0 - infer patch/minor)
- publish: no (packages are private, pre-launch)
- docs: `docs/` folder (PRDs, ROADMAP, DECISIONS) + this CLAUDE.md as index; record as-built deviations in `DECISIONS.md`
