# claudepad

Turn a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, **end-to-end-encrypted** artifact - entirely in your browser. Drop a session, see it prettified, then encrypt it **to a specific recipient's public key** and drop the resulting blob anywhere (Slack, email, a file). Only the invited recipient can read it, because **there is no server in the data path**.

Open source and self-hostable. [`claudepad.io`](https://claudepad.io) is a free hosted instance running the identical static bundle.

> **Status:** v1 feature-complete (phases P0-P4 built), in launch hardening (P5). The independent security review (PRD-09 FR-16) is the remaining hard gate before the v1.0 tag. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What it does

- **Prettify** - drop or paste a session, or connect your `~/.claude` folder once and browse every project/session from the sidebar. Markdown, code, tools, and thinking render cleanly. Fully offline.
- **Identity** - mint an ECDH keypair in your browser (no account). Export it for backup; optionally lock it behind your device's passkey (WebAuthn PRF).
- **Share, trustlessly** - encrypt a session to a recipient's public key. A mandatory secret-review step redacts detected secrets; you choose, per recipient, whether to grant the transcript only or the transcript *and* its secrets. Output is a self-contained `cp-blob-…` you carry anywhere.
- **Receive** - paste a blob, decrypt with your identity (non-recipients get nothing), verify the sender's fingerprint, and view.
- **Playback** - replay a session with a timeline scrubber, speed control, and presentation-mode auto-pacing.

## Why it's built this way

- **No server, nothing to trust** - parsing, identity, encryption, and decryption all run in the browser. "The host can't read it" is true because there is no host.
- **The blob is the message** - a share is a self-contained encrypted artifact you carry, not a link pointing at a server.
- **Trust is verifiable** - a self-claimed name is paired with a key **fingerprint** (6 emoji + hex) for out-of-band verification.
- **Zero-dependency crypto** - WebCrypto only (AES-256-GCM, ECDH P-256, HKDF, SHA-256), so the core is auditable. Proven by [`poc/verify.mjs`](poc/verify.mjs).
- **Single static bundle** - self-hosting is "serve some files"; no CDNs, fonts self-hosted, no third-party runtime fetches.
- **Honesty over polish** in security claims - the [threat model](docs/THREAT-MODEL.md) states the trade-offs plainly.

## Use it

The fastest path is the hosted instance: open [`claudepad.io`](https://claudepad.io) and drop a session. Nothing you do there leaves your browser - [verify that yourself](docs/verify-zero-knowledge.md).

## Self-host (serve a static bundle)

```sh
pnpm install
pnpm build                       # → packages/client/dist (single static bundle)
npx serve packages/client/dist   # or nginx, Caddy, Cloudflare, S3+CDN, GitHub Pages…
```

No database, no API, no accounts, no env vars. Full guide: [`docs/self-hosting.md`](docs/self-hosting.md).

## Verify the claims

You don't have to trust us:

```sh
node poc/verify.mjs                          # crypto conformance: non-recipient lockout, tiered decrypt, no plaintext in blob
pnpm build && node scripts/check-no-external-origins.mjs   # the bundle makes no third-party fetches
```

Plus a live network-capture procedure in [`docs/verify-zero-knowledge.md`](docs/verify-zero-knowledge.md).

## Monorepo layout

```
packages/
  schema/   @claudepad/schema   - tolerant Claude Code JSONL → normalized Session model (PRD-02). Zero deps, isomorphic.
  shared/   @claudepad/shared   - zero-dependency WebCrypto core (PRD-05): ECDH P-256, HKDF, AES-256-GCM, sealed-box blobs, fingerprints.
  secrets/  @claudepad/secrets  - pure secret scanner + redactor, opaque placeholders, body/secret-map split (PRD-06).
  ingest/   @claudepad/ingest   - drop/paste/folder-connect ingest + session metadata (PRD-04).
  client/   @claudepad/client   - the web client: design system, viewer, identity, share, playback. Single static bundle.
docs/       PRDs + canonical design/security/decision docs (start with ROADMAP, TRUSTLESS-MODEL, THREAT-MODEL).
poc/        the runnable proof of concept + verify.mjs (crypto conformance anchor).
```

There is **no `server`** in v1 by design - an optional store addon is vNext (DECISIONS D-20…D-33).

## Develop

Requires Node ≥ 20 and pnpm.

```sh
pnpm dev                 # run the client (Vite) at http://localhost:5173
pnpm test                # the whole Vitest suite
pnpm check               # typecheck + lint + test + verify:poc (the full gate)
pnpm --filter @claudepad/client test:e2e   # Playwright
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor guide and [`SECURITY.md`](SECURITY.md) to report a vulnerability.

## Docs

- [`docs/ROADMAP.md`](docs/ROADMAP.md) - phases and success metrics
- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) - what's defended, what isn't, in plain language
- [`docs/TRUSTLESS-MODEL.md`](docs/TRUSTLESS-MODEL.md) - the canonical v1 crypto/identity design
- [`docs/self-hosting.md`](docs/self-hosting.md) · [`docs/verify-zero-knowledge.md`](docs/verify-zero-knowledge.md)
- [`docs/prd/`](docs/prd/) - the full PRD set · [`docs/DECISIONS.md`](docs/DECISIONS.md) - decision log

## License

[MIT](LICENSE).
