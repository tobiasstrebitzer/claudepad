# claudepad

Turn a raw Claude Code session (`~/.claude/projects/*.jsonl`) into a clean, shareable, **end-to-end-encrypted** artifact - entirely client-side. Drop a session, see it prettified, then encrypt it **to a specific recipient's public key** and drop the resulting blob anywhere. Only the invited recipient can read it, because there is no server in the data path.

> **Status:** P0 (Foundation) landed - the monorepo, design system, tolerant parser, and zero-dependency crypto core. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for phases P0–P5.

## Monorepo layout

```
packages/
  schema/   @claudepad/schema  - tolerant Claude Code JSONL → normalized Session model (PRD-02). Zero deps, isomorphic.
  shared/   @claudepad/shared  - zero-dependency WebCrypto core (PRD-05 §6.10): ECDH P-256, HKDF, AES-256-GCM,
                                 recipient-wrapped sealed-box blobs, key fingerprints. Mirrors poc/.
  client/   @claudepad/client  - web client: design system, app shell, /gallery (PRD-01). Single static bundle.
docs/       PRDs + canonical design/security/decision docs.
poc/        the runnable proof of concept + verify.mjs (16-check crypto anchor).
```

Planned (later phases): a `cli` package (PRD-04). There is **no `server`** in v1 by design - a store addon is vNext.

## Develop

Requires Node ≥ 20 and pnpm.

```sh
pnpm install            # install the workspace
pnpm dev                # run the client (Vite) at http://localhost:5173  → #/ and #/gallery
pnpm test               # run the whole Vitest suite (schema + shared + client)
pnpm typecheck          # tsc across all packages
pnpm lint               # eslint + no-raw-hex + WCAG contrast checks
pnpm verify:poc         # node poc/verify.mjs - the 16-check crypto conformance anchor
pnpm check              # typecheck + lint + test + verify:poc (the full gate)
pnpm --filter @claudepad/client test:e2e   # Playwright (responsive shell + theme)
```

## Principles (why it's built this way)

- **No server, nothing to trust** - parse, identity, encrypt, decrypt are all in the browser.
- **Zero-dependency crypto** - WebCrypto only for the v1 core, so it's auditable; `poc/verify.mjs` stays green.
- **Single static bundle** - self-hosting is "serve some files"; no third-party runtime fetches (fonts self-hosted, no CDNs).
- **Honesty over polish** in security claims - trade-offs are documented, not buried (see [`docs/TRUSTLESS-MODEL.md`](docs/TRUSTLESS-MODEL.md)).

## License

MIT (see [`docs/DECISIONS.md`](docs/DECISIONS.md) Q-11).
