# claudepad

Turn a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, **end-to-end-encrypted** artifact - entirely in your browser. Drop a session, see it prettified, then encrypt it **to a specific recipient's public key** and drop the resulting blob anywhere (Slack, email, a file). Only the invited recipient can read it, because **there is no server in the data path**.

Open source and self-hostable. [`claudepad.io`](https://claudepad.io) is a free hosted instance running the identical static bundle.

> **Status:** an early, open-source developer demo - v1 feature-complete (phases P0-P5 built), shared to gather feedback and find the use cases worth building. The crypto core is intentionally small and auditable, but it has **not** had an independent security review yet; treat claudepad as a capable demo rather than a vault for your most sensitive secrets. An audit is welcome. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

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
- **Zero-dependency crypto** - WebCrypto only (AES-256-GCM, ECDH P-256, HKDF, SHA-256), so the core is auditable. Proven end-to-end by [`packages/crypto/test/conformance.test.ts`](packages/crypto/test/conformance.test.ts).
- **Single static bundle** - self-hosting is "serve some files"; no CDNs, fonts self-hosted, no third-party runtime fetches.
- **Honesty over polish** in security claims - the [threat model](docs/THREAT-MODEL.md) states the trade-offs plainly.

## Use it

The fastest path is the hosted instance: open [`claudepad.io`](https://claudepad.io) and drop a session. Nothing you do there leaves your browser - [verify that yourself](docs/VERIFY_ZERO_KNOWLEDGE.md).

## Self-host (serve a static bundle)

```sh
pnpm install
pnpm build                    # → apps/client/dist (single static bundle)
npx serve apps/client/dist    # or nginx, Caddy, Cloudflare, S3+CDN, GitHub Pages…
```

No database, no API, no accounts, no env vars. Full guide: [`docs/self-hosting.md`](docs/self-hosting.md).

## Verify the claims

You don't have to trust us:

```sh
pnpm test                                    # crypto conformance: non-recipient lockout, tiered decrypt, no plaintext in blob
pnpm build && pnpm run verify:no-phone-home  # the built bundle makes no third-party fetches
```

Plus a live network-capture procedure in [`docs/VERIFY_ZERO_KNOWLEDGE.md`](docs/VERIFY_ZERO_KNOWLEDGE.md).

## Monorepo layout

```
apps/
  client/    @claudepad/client    - the deployable SPA: design system, tolerant JSONL parser, secret
                                    scanner, viewer, identity, share, playback. Single static bundle.
  registry/  @claudepad/registry  - optional registry Worker (vNext addon; not in the launch bundle).
packages/
  crypto/           @claudepad/crypto          - zero-dependency WebCrypto core (PRD-05): ECDH P-256, HKDF,
                                                 AES-256-GCM, sealed-box blobs, fingerprints. test/conformance.test.ts is the anchor.
  registry-spec/    @claudepad/registry-spec   - the open registry contract (interfaces, DTOs, OpenAPI).
  registry-client/  @claudepad/registry-client - fetch SDK + conformance suite for any conformant registry.
docs/       PRDs + canonical design/security/decision docs (start with ROADMAP, TRUSTLESS-MODEL, THREAT-MODEL).
```

There is **no `server`** in the launch bundle by design. The optional **registry** (`apps/registry` + the `registry-*` packages) is a separate, opt-in addon for short-links and a public-key directory; it stores only opaque blobs it cannot read, and sharing works fully offline without it (DECISIONS D-20…D-33, D-74…D-88).

## Develop

Requires Node ≥ 20 and pnpm.

```sh
pnpm dev                 # run the client (Vite) at http://localhost:5173
pnpm test                # the whole Vitest suite
pnpm check               # build + typecheck + lint (no-raw-hex + WCAG contrast) + tests (the full gate)
pnpm --filter @claudepad/client test:e2e   # Playwright
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor guide and [`SECURITY.md`](SECURITY.md) to report a vulnerability.

## Docs

- [`docs/ROADMAP.md`](docs/ROADMAP.md) - phases and success metrics
- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) - what's defended, what isn't, in plain language
- [`docs/TRUSTLESS-MODEL.md`](docs/TRUSTLESS-MODEL.md) - the canonical v1 crypto/identity design
- [`docs/self-hosting.md`](docs/self-hosting.md) · [`docs/VERIFY_ZERO_KNOWLEDGE.md`](docs/VERIFY_ZERO_KNOWLEDGE.md)
- [`docs/prd/`](docs/prd/) - the full PRD set · [`docs/DECISIONS.md`](docs/DECISIONS.md) - decision log

## License

[MIT](LICENSE).
