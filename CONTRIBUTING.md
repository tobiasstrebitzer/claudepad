# Contributing to claudepad

Thanks for considering a contribution. claudepad is open source and self-hostable; the value is the auditable, zero-knowledge architecture, so contributions that keep it small, honest, and auditable are especially welcome.

Please read [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) and the design principles in [`CLAUDE.md`](CLAUDE.md) before working on anything touching crypto, secrets, or the share flow.

## Prerequisites

- **Node ≥ 20**
- **pnpm** (`packageManager` is pinned in [`package.json`](package.json); install via `corepack enable`)

## Setup

```sh
git clone https://github.com/tobiasstrebitzer/claudepad
cd claudepad
pnpm install
```

## Monorepo layout

```
packages/
  schema/   @claudepad/schema   - tolerant Claude Code JSONL → normalized Session model (PRD-02). Zero deps, isomorphic.
  shared/   @claudepad/shared   - zero-dependency WebCrypto core (PRD-05): ECDH P-256, HKDF, AES-256-GCM,
                                  recipient-wrapped sealed-box blobs, fingerprints. Mirrors poc/.
  secrets/  @claudepad/secrets  - pure secret scanner + redactor, opaque placeholders, body/secret-map split (PRD-06).
  ingest/   @claudepad/ingest   - drop/paste/folder-connect ingest + session metadata extraction (PRD-04).
  client/   @claudepad/client   - the web client: design system, viewer, identity, share, playback (PRD-01/03/08/10/11).
docs/       PRDs + canonical design/security/decision docs.
poc/        the runnable proof of concept + verify.mjs (the crypto conformance anchor).
```

Shared normalized-session types and the crypto envelope live in **one** package each (`schema`, `shared`) and are consumed everywhere - don't duplicate them.

## Develop

```sh
pnpm dev                 # run the client (Vite) at http://localhost:5173
pnpm build               # build all packages → packages/client/dist (single static bundle)
pnpm test                # the whole Vitest suite (schema + shared + secrets + ingest + client)
pnpm typecheck           # tsc across all packages
pnpm lint                # eslint + no-raw-hex + WCAG contrast checks
pnpm verify:poc          # node poc/verify.mjs - the crypto conformance anchor
pnpm --filter @claudepad/client test:e2e   # Playwright (responsive shell, viewer, playback)
```

## The gate

Before opening a PR, the full gate must pass:

```sh
pnpm check               # typecheck + lint + test + verify:poc
```

`pnpm check` is what CI runs on every PR (plus Playwright E2E). A red pipeline blocks merge.

### House rules enforced by the gate

- **Zero-dependency crypto.** Don't add a crypto library for the v1 core - WebCrypto only. `pnpm verify:poc` must stay green.
- **No server assumptions.** Every flow must work fully offline. No `claudepad.io/store` URL or store-specific code in the client (DECISIONS D-33).
- **No raw color hex** outside `packages/client/src/styles/tokens.css` (`scripts/check-no-raw-hex.mjs`).
- **WCAG contrast** on the token palette (`scripts/check-contrast.mjs`).
- **No third-party fetches** in the built bundle (`scripts/check-no-external-origins.mjs`, run after `pnpm build`).

## Conventions

- **Conventional Commits** for messages (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, …), scoped where useful (`feat(share): …`).
- **Branch + PR**: branch off `master`, open a PR; keep PRs focused and the gate green. Do **not** add an AI co-author trailer to commits.
- **Naming for intent, not mechanism** - see the principle in [`CLAUDE.md`](CLAUDE.md). The code should read like the product.
- **Honesty over polish in security claims** - surface trade-offs, don't bury them.
- Prefer readable code over verbose comments. Avoid em-dashes in prose.

## Conforming to the canonical docs

If a PRD conflicts with [`docs/prd/_context.md`](docs/prd/_context.md) or [`docs/TRUSTLESS-MODEL.md`](docs/TRUSTLESS-MODEL.md), those win - or update them deliberately and record the change in [`docs/DECISIONS.md`](docs/DECISIONS.md). Record any as-built deviation from a PRD in `DECISIONS.md`.

## Security issues

Do **not** open a public issue for a vulnerability. Follow [`SECURITY.md`](SECURITY.md).

## Releasing (maintainers)

claudepad follows [semantic versioning](https://semver.org/); the blob/identity **envelope version** (currently `1`) is tracked independently of the product version so wire-format changes stay visible.

1. Land changes on `master` with the gate green.
2. Update [`CHANGELOG.md`](CHANGELOG.md) under a new version heading.
3. Bump versions across packages (aligned; pre-1.0 = infer patch/minor) and the root `package.json`.
4. Tag `vX.Y.Z`. CI/CD builds the bundle, attaches it with SHA-256 checksums to the GitHub Release, and deploys `claudepad.io` from the same tag.
