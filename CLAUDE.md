# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**claudepad** turns a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, private artifact. You drop/paste a session, see it prettified, and — to share — **encrypt it to a specific recipient's public key**, producing a self-contained blob you can drop anywhere (Slack, email, a file). Only the invited recipient can read it.

Open-source and self-hostable, with `claudepad.io` as a free hosted instance running the same code.

## Project status (2026-06-20)

**Pre-development.** The repo currently contains **docs (the finalized PRD set)** and a **working proof of concept** (`poc/`). The production monorepo has not been scaffolded yet (that's the next session).

## The one decision that shapes everything: v1 is serverless & trustless

v1 is **entirely client-side**. There is **no backend**. "The host can't read it" is true because there is no host. Sharing = encrypt-to-recipient → blob carried by the user.

**In v1:** session parsing & prettify · client-minted identity (ECDH P-256 keypair, no account) · encrypt-to-recipient sharing with per-recipient secret tiering · key fingerprints for trust · optional WebAuthn-PRF device protection of the identity · playback. All in the browser.

**Deferred to vNext (consciously giving up):** any server/blob store, hosted `/s/<id>` URLs, fragment-link "share with anyone" mode, expiry / burn / revocation, inbox/discovery, pinning. When a store returns it is an **optional, opt-in addon defined by an open spec** (Bitwarden/Headscale model) — `claudepad.io/store` would be just a reference implementation. **Never put store-specific code or a `claudepad.io/store` URL in the v1 client.**

See `docs/DECISIONS.md` D-20…D-33 for the full rationale.

## Where things live

```
docs/
  ROADMAP.md            # phases P0–P5 to v1, build order, success metrics
  CONCEPT.md            # the idea + prior-art / competitive landscape
  TRUSTLESS-MODEL.md    # ★ canonical v1 crypto/identity design (proven by poc/)
  SECURITY-MODEL.md     # threat-model framing (link/lifecycle sections = vNext)
  STORE-PROVIDER-SPEC.md# the pluggable-store seam (open spec; store = vNext)
  DECISIONS.md          # ★ decision log (D-1…D-33) + open questions + vNext backlog
  prd/
    _context.md         # ★ canonical shared facts (tech stack, tokens, security, schema)
    README.md           # PRD index + briefs
    PRD-01 … PRD-11     # the PRDs (see index below)
poc/
  trustless-share.html  # ★ runnable PoC: identity, encrypt-to-recipient, tiers, fingerprints, WebAuthn-PRF
  verify.mjs            # 16-check headless crypto conformance anchor (`node poc/verify.mjs`)
  README.md             # how to run (incl. localhost for WebAuthn)
```

★ = read these first.

### PRD index
- **01** Design System · **02** Parser & Schema · **03** Viewer · **04** Ingest & Share Output · **05** Crypto Core & Recipient Wrapping · **06** Secret Detection & Tiered Reveal · **08** Playback · **09** Self-Hosting (Static) & Launch · **10** Identity, Trust & Device Keys · **11** Trustless Recipient Sharing.
- **07** (Store Provider Spec & Reference Impl) is **vNext / deferred** — not v1.

## The PoC is the reference implementation

`poc/` already proves the crypto/identity/sharing core. Production code should mirror it and keep `poc/verify.mjs` green.

- **Crypto (zero-dependency WebCrypto):** AES-256-GCM (content/wrap), ECDH **P-256** (identity + key agreement), HKDF-SHA256 (derivation), SHA-256 (fingerprints). No custom primitives, no `crypto-js`.
- **Share = ephemeral sealed box:** per share, generate an ephemeral ECDH keypair; `KW = HKDF(ECDH(eph, recipientPub))`; wrap two **independent** content keys `{ K_body, K_secret? }` under `KW`; encrypt body with `K_body`, secret map with `K_secret`. Tier = which keys you wrap (body-only omits the secret layer).
- **Fingerprint:** `SHA-256(rawPublicKey)` → 6 emoji (palette of 64) + 8-hex code; shown for your key, a recipient's, and a blob's sender.
- **Device keys:** WebAuthn **PRF** extension as a local key oracle (no server). Pattern A (default) = PRF output → KEK that wraps the stored private key. PRF evaluated **at registration** to avoid a double prompt. Needs a real origin (not `file://`).
- Run the PoC over localhost for WebAuthn: `cd poc && python3 -m http.server 8782` → `http://localhost:8782/trustless-share.html`. Verify crypto: `node poc/verify.mjs`.

## Intended tech stack (for the monorepo, next session)

TypeScript (strict) · Vite + React 18 · shadcn/ui on base-ui + Tailwind · WebCrypto (zero-dep core; `@noble/curves` only if the opt-in multi-device "pattern B" identity ships) · Vitest + Playwright. Target a **single static bundle** (self-host = serve files). Planned layout: `packages/{client, shared, cli}` (no `server` in v1).

## Working conventions

- **Conform to the canonical docs.** If a PRD conflicts with `docs/prd/_context.md` or `docs/TRUSTLESS-MODEL.md`, those win (or update them deliberately and note it in `DECISIONS.md`).
- **Keep the crypto zero-dependency and auditable.** Don't introduce a crypto lib for the v1 core.
- **No server assumptions.** Every flow must work fully offline. No `claudepad.io/store` URL or store code in the client (D-33).
- **Honesty over polish in security claims.** Surface trade-offs (no recall/expiry, self-claimed names, best-effort redaction) — see `TRUSTLESS-MODEL.md` §7.
- **Design language:** warm-minimal (paige/white canvas, clay-orange accent), serif display + clean sans, per `_context.md` §4 — Anthropic-inspired but a distinct claudepad identity.
- Some PRD sections (PRD-05 §4/§7.3/§7.4/§6.6, PRD-07 entirely, parts of PRD-09) describe the **vNext** link/store path and are explicitly banner-tagged — don't implement them for v1.
