# Contributing to claudepad

Thanks for considering a contribution. claudepad is open source and self-hostable; the value is the auditable, zero-knowledge architecture, so contributions that keep it small, honest, and auditable are especially welcome.

Please read [`docs/threat-model.md`](docs/threat-model.md) and the design principles in [`CLAUDE.md`](CLAUDE.md) before working on anything touching crypto, secrets, or the share flow.

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
apps/
  client/    @claudepad/client    - the web client (deployable SPA): design system, parser/schema,
                                    secret scanner, ingest, viewer, identity, share, playback.
  registry/  @claudepad/registry  - the optional registry reference impl (Cloudflare Worker, vNext addon).
packages/
  crypto/          @claudepad/crypto          - zero-dependency WebCrypto core: ECDH P-256, HKDF,
                                                AES-256-GCM, recipient-wrapped sealed-box blobs, fingerprints.
                                                `test/conformance.test.ts` is the crypto conformance anchor.
  registry-spec/   @claudepad/registry-spec   - the open registry contract (interfaces, wire DTOs, OpenAPI).
  registry-client/ @claudepad/registry-client - generic fetch SDK for any conformant registry.
docs/        canonical design/security/decision docs + the surviving store-addon PRD (prd/).
```

Deployables live in `apps/`, shared libraries in `packages/`. The normalized-session schema and secret scanner live under `apps/client/src/{schema,secrets,ingest}`; the crypto envelope lives once in `packages/crypto` and is consumed everywhere - don't duplicate them.

## Develop

```sh
pnpm dev                 # run the client (Vite) at http://localhost:5173
pnpm build               # build all packages → apps/client/dist (single static bundle)
pnpm test                # the whole Vitest suite (client + crypto + registry packages)
pnpm typecheck           # tsc across all packages
pnpm lint                # eslint + no-raw-hex + WCAG contrast checks
pnpm --filter @claudepad/crypto test       # crypto conformance anchor (packages/crypto/test/conformance.test.ts)
pnpm --filter @claudepad/client test:e2e   # Playwright (responsive shell, viewer, playback)
```

## The gate

Before opening a PR, the full gate must pass:

```sh
pnpm check               # build + typecheck + lint + test
```

`pnpm check` is what CI runs on every PR (plus Playwright E2E). A red pipeline blocks merge.

### House rules enforced by the gate

- **Zero-dependency crypto.** Don't add a crypto library for the v1 core - WebCrypto only. The crypto conformance suite (`packages/crypto/test/conformance.test.ts`) must stay green.
- **No server assumptions.** Every flow must work fully offline. The registry is referenced as a single opt-in constant (`apps/client/src/registry/defaults.ts`), unchecked by default - don't scatter store/registry URLs elsewhere or assume a registry exists in any flow (DECISIONS D-33, relaxed by D-88/D-89).
- **No raw color hex** outside `apps/client/src/styles/tokens.css` (`scripts/check-no-raw-hex.mjs`).
- **WCAG contrast** on the token palette (`scripts/check-contrast.mjs`).
- **No third-party fetches** in the built bundle (`scripts/check-no-external-origins.mjs`, run after `pnpm build`).

## Conventions

- **Conventional Commits** for messages (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, …), scoped where useful (`feat(share): …`).
- **Branch + PR**: branch off `master`, open a PR; keep PRs focused and the gate green. Do **not** add an AI co-author trailer to commits.
- **Naming for intent, not mechanism** - see the principle in [`CLAUDE.md`](CLAUDE.md). The code should read like the product.
- **Honesty over polish in security claims** - surface trade-offs, don't bury them.
- Prefer readable code over verbose comments. Avoid em-dashes in prose.

## Conforming to the canonical docs

If a PRD conflicts with [`docs/prd/_context.md`](docs/prd/_context.md) or [`docs/trustless-model.md`](docs/trustless-model.md), those win - or update them deliberately and record the change in [`docs/decisions.md`](docs/decisions.md). Record any as-built deviation from a PRD in `decisions.md`.

## Security issues

Do **not** open a public issue for a vulnerability. Follow [`SECURITY.md`](SECURITY.md).

## Releasing (maintainers)

claudepad follows [semantic versioning](https://semver.org/); the blob/identity **envelope version** (currently `1`) is tracked independently of the product version so wire-format changes stay visible.

1. Land changes on `master` with the gate green.
2. Update [`CHANGELOG.md`](CHANGELOG.md) under a new version heading.
3. Bump versions across packages (aligned; pre-1.0 = infer patch/minor) and the root `package.json`.
4. Tag `vX.Y.Z`. CI/CD builds the bundle, attaches it with SHA-256 checksums to the GitHub Release, and deploys `claudepad.io` from the same tag.
