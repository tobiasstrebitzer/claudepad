# PRD-09 - Self-Hosting (Static) & Launch

> **Phase:** P5 (Launch → v1.0) · **Status:** Draft · **Re-scoped by the serverless-v1 pivot (DECISIONS D-20…D-33).**
> **v1 self-host = serve a static bundle.** No API, no DB, no blob store, no services. "Self-host == hosted" is now trivially true: `claudepad.io` *is* the same static files. The earlier `docker compose` + Postgres + MinIO + Cloudflare-Workers deployment below is the **vNext** path for the **optional Store Provider addon** (open spec, `../STORE-PROVIDER-SPEC.md`; reference impl = PRD-07), **not** part of the v1 launch. The v1 client must contain **no `claudepad.io/store` URL or store-specific code** (D-33).
> Canonical context: [`_context.md`](./_context.md) · v1 design: [`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md) · Security: [`../SECURITY-MODEL.md`](../SECURITY-MODEL.md) · Roadmap: [`../ROADMAP.md`](../ROADMAP.md)

---

## 1. Summary & problem

claudepad's trust story is now the strongest possible: **there is nothing to host but static files.** A developer self-hosts by serving the built bundle from any static host (or `file://`-adjacent local server for WebAuthn); `claudepad.io` runs the identical files. This PRD turns PRD-01…PRD-08, PRD-10, PRD-11 into a shippable, auditable open-source **static** release: the build + static-deploy path, a (small) configuration/env reference (e.g. optional `STORE_URL`, default empty), the public threat-model docs ([`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md)), the **gating independent security review** of the crypto core (PRD-05), identity/device keys (PRD-10), and secret handling (PRD-06/PRD-11), licensing, contributor/release process, CI/CD, and a v1.0 launch checklist mapping to ROADMAP §6.
>
> **Below, treat the server/`docker compose`/Cloudflare/Postgres/MinIO sections as the vNext store-addon deployment (PRD-07), not v1.** The v1 deploy is: build → static files → any host.

## 2. Goals / Non-goals

**Goals**
- Ship a **single `docker compose up`** path that brings up client + API + Postgres + S3-compatible (MinIO) store and is usable in **< 5 min** from a clean machine (ROADMAP §6).
- Deliver the **Cloudflare deploy path** (Workers + R2 + D1/KV per PRD-07) used by hosted `claudepad.io`, from the same source tree.
- Provide a **complete, single-source configuration/env-var reference** covering storage backend, size/rate limits, TTL defaults, base URL, and abuse controls - identical semantics across both backends.
- Publish a **public THREAT-MODEL document** (plain language, derived from `SECURITY-MODEL.md`) and make it a launch-blocking deliverable.
- Make an **independent security review** of the crypto core (PRD-05) and secret handling (PRD-06) a hard gate on v1.0 (per `SECURITY-MODEL.md` "Pre-v1 requirement").
- Recommend an **open-source license** with rationale and apply it across the repo.
- Define the **monorepo layout, contributor docs** (CONTRIBUTING, build, test, release), **versioning/release process**, and **CI/CD**.
- Produce a **v1.0 launch checklist** that traces every ROADMAP §6 success metric to a verifiable check.

**Non-goals**
- New product features. PRD-09 packages and launches; it does not add user-facing capabilities beyond config surface.
- Multi-tenant hosting, billing, orgs/teams, SSO - explicitly vNext (ROADMAP §5).
- Convenience / non-ZK mode, server-side search - out of scope for v1 (`_context.md` §5.5).
- Kubernetes/Helm charts, Terraform modules, or managed-cloud one-click marketplace images (post-v1 nice-to-haves; compose + Cloudflare are the v1 commitments).
- Implementing PRD-05/06/07 logic - those are owned upstream; here we deploy and gate on them.

## 3. Personas & user stories

- **Self-hoster** (primary, `_context.md` §2): *As a developer with my own infra, I want `docker compose up` to give me a working claudepad with no third-party accounts, so that I control my data and can audit the code.*
- **Self-hoster (security-conscious):** *As an operator, I want a single env-var reference and a public threat model, so that I can configure limits/TTLs correctly and understand exactly what my server can and cannot see.*
- **claudepad.io maintainer:** *As the hosted-instance operator, I want a reproducible Cloudflare deploy from the same repo, so that hosted and self-hosted run identical, auditable code.*
- **Open-source contributor:** *As a contributor, I want clear CONTRIBUTING/build/test/release docs and green CI, so that I can land a change confidently in one afternoon.*
- **Security reviewer:** *As an independent auditor, I want a documented threat model, a small auditable surface, and a single-file client bundle, so that I can review the crypto core and secret handling effectively.*
- **Evaluator / skeptic:** *As someone deciding whether to trust claudepad, I want to verify zero-knowledge myself (network capture shows only ciphertext), so that the claim is a property I can check, not a promise.*

## 4. UX & flows

This PRD's "UX" is operator- and contributor-facing (terminals, config, docs), not end-user screens.

### 4.1 Self-host happy path (target < 5 min)

```
$ git clone https://github.com/claudepad/claudepad && cd claudepad
$ cp .env.example .env          # sane defaults; works unedited for localhost
$ docker compose up -d          # pulls/builds: web, api, postgres, minio, (createbuckets)
  ✓ postgres   healthy
  ✓ minio      healthy
  ✓ createbuckets exited 0  (bucket "claudepad" created)
  ✓ api        healthy  (ran migrations, GET /healthz → 200)
  ✓ web        healthy  (static bundle served, /config.js reachable)
$ open http://localhost:8080
  → drop a .jsonl → review → Share → copy …/s/<id>#<key>
```

First-run banner in the web UI when `CLAUDEPAD_BASE_URL` is still `localhost`, reminding the operator to set a public base URL before sharing links externally.

### 4.2 Cloudflare deploy path (hosted)

```
$ cd packages/server
$ wrangler d1 create claudepad-meta          # one-time
$ wrangler d1 migrations apply claudepad-meta
$ wrangler r2 bucket create claudepad-blobs   # one-time
$ npm run deploy:cf                           # wrangler deploy (Worker = same Hono app via adapter)
# Pages/Workers static asset upload for the client bundle (packages/web/dist)
```

Same handlers, same wire format (PRD-07); only the storage/metadata adapters differ, selected by config.

### 4.3 Contributor loop

```
$ pnpm install
$ pnpm build          # builds shared types → client → server
$ pnpm test           # vitest units + playwright critical flows
$ pnpm lint typecheck
$ pnpm dev            # local web + api with hot reload
```

### 4.4 Release flow (maintainer)

```
changeset add → PR → merge → CI builds + tests → tag vX.Y.Z
  → publish Docker images (web, api) to GHCR
  → attach single-file client bundle + checksums to GitHub Release
  → deploy claudepad.io from the same tag
```

## 5. Functional requirements

Numbered, testable. "MUST" = launch-blocking unless marked.

### Self-host (Docker Compose)

- **FR-1** The repo MUST include a `docker-compose.yml` that, from a clean checkout with the unedited `.env.example` copied to `.env`, brings up four logical services - `web` (static client bundle), `api` (Node/Hono server), `postgres`, `minio` (S3-compatible) - plus a one-shot `createbuckets` init, and reaches a fully usable state (share + view round-trip) with a single `docker compose up`.
- **FR-2** Bringing the stack up MUST complete in **< 5 minutes** on a reference machine (documented: 4 vCPU / 8 GB, warm Docker image cache or pre-built published images), measured from `docker compose up` to a successful share→view round-trip. *(ROADMAP §6.)*
- **FR-3** The default compose configuration MUST require **no third-party accounts or external services** - Postgres and MinIO run locally as containers. *(`_context.md` §2 self-hoster.)*
- **FR-4** The `api` service MUST run idempotent database **migrations automatically on startup** (or via a documented one-shot `migrate` command) and expose `GET /healthz` (liveness) and `GET /readyz` (DB + blob store reachable) endpoints; compose `depends_on` MUST gate `web`/`api` on healthchecks.
- **FR-5** Published, versioned **Docker images** (`ghcr.io/claudepad/web`, `ghcr.io/claudepad/api`) MUST be available per release so operators can run without a local build; image tags MUST match the release version and `latest` MUST track the newest stable tag.
- **FR-6** The `web` service MUST serve the **single static client bundle** (PRD-01/03 build output) and a runtime `config.js` (or `/config` endpoint) so that base URL and limits are injected at deploy time **without rebuilding** the bundle. *(`_context.md` §3 "single static bundle".)*
- **FR-7** Self-host MUST carry **no security or feature penalty** vs. hosted: the same client bundle, same crypto, same two-key envelope (PRD-05/06). No self-host-only code path may weaken zero-knowledge. *(SECURITY-MODEL Goal 3.)*

### Cloudflare deploy path

- **FR-8** The server MUST build and deploy as a **Cloudflare Worker** (Hono app via the Workers adapter) using `wrangler`, with R2 as the blob backend and D1 or KV as the metadata backend, per PRD-07.
- **FR-9** The Cloudflare and Node/Postgres deployments MUST be the **same application code**, differing only in the storage/metadata adapter selected by configuration; the HTTP wire format (PRD-07/PRD-05 envelope) MUST be byte-identical across both.
- **FR-10** A documented `wrangler.toml`/`wrangler.jsonc` and `npm run deploy:cf` MUST exist, including one-time D1 migration and R2 bucket provisioning steps. The hosted `claudepad.io` instance MUST be deployable from a tagged release.

### Configuration

- **FR-11** All runtime behavior MUST be configurable via **environment variables** documented in a **single reference table** (see §7.2). Server MUST validate config at startup and **fail fast** with a clear message on invalid/missing required values.
- **FR-12** Config MUST cover, at minimum: storage backend selection, blob/metadata store connection, max blob size, default and max TTL, burn-after-read default, base URL, rate limits, and CORS/allowed-origin. Each setting MUST have a safe default except secrets (DB password, S3 credentials) which MUST have **no default** and be required.
- **FR-13** Storage backend MUST be **pluggable** behind the PRD-07 storage interface, selectable by `CLAUDEPAD_STORAGE_DRIVER` (`s3` | `r2`) and `CLAUDEPAD_META_DRIVER` (`postgres` | `d1` | `kv`); adding a driver MUST NOT require changes to handler code.
- **FR-14** The server MUST **never log** plaintext, keys, or full ciphertext; config that could increase verbosity (`LOG_LEVEL=debug`) MUST still redact blob bodies and MUST be documented as such. *(SECURITY-MODEL "Key-handling hygiene".)*

### Threat-model docs & security review (gating)

- **FR-15** A public **`docs/THREAT-MODEL.md`** MUST exist, written in plain language, covering: zero-knowledge baseline, two-key tiered reveal, placeholder rules, best-effort redaction limits, lifecycle controls, and the explicit out-of-scope items (metadata leakage, fragment leakage, endpoint compromise, recipient re-leak). It MUST be consistent with `SECURITY-MODEL.md` and linked from the README. *(SECURITY-MODEL Goal 4, §5.7.)*
- **FR-16** An **independent security review** of the crypto core (PRD-05) and secret handling (PRD-06) MUST be **completed, its findings triaged, and all critical/high findings resolved or formally accepted with rationale**, *before* the v1.0 tag is cut. This is a hard launch gate. *(SECURITY-MODEL "Pre-v1 requirement".)*
- **FR-17** The repo MUST include a **`SECURITY.md`** with a vulnerability-disclosure policy, contact, and supported-versions statement.
- **FR-18** The project MUST provide a **reproducible zero-knowledge verification procedure** (documented steps + a test/script) demonstrating that an upload network capture contains no plaintext transcript or secret. *(ROADMAP §6 "zero-knowledge verifiable".)*

### Licensing, repo, contributor docs

- **FR-19** The repo MUST carry a single, OSI-approved **open-source license** (recommendation §6.5) at root, with SPDX headers or a documented licensing note, and a license-compatibility check in CI for dependencies.
- **FR-20** The repo MUST follow the documented **monorepo layout** (§7.3) with `packages/` for `shared` types, `web` client, `server`, and `cli`, where shared normalized-session types live in **one** package consumed by client, CLI, and tests. *(`_context.md` §3.)*
- **FR-21** The repo MUST include **`CONTRIBUTING.md`** documenting environment setup, the build, test, lint/typecheck commands, branch/PR conventions, and the release process, such that a new contributor can build and test green from a clean clone by following it.
- **FR-22** A root **`README.md`** MUST present the product, the two deploy paths (quick-start each), links to PRDs/threat model, and the success-metric claims with how to verify them.

### Versioning, CI/CD, release

- **FR-23** The project MUST follow **semantic versioning** (`MAJOR.MINOR.PATCH`); the wire format / envelope version (PRD-05/07) MUST be tracked independently and documented so format changes are visible to operators.
- **FR-24** **CI** MUST run on every PR: install, build (shared→web→server→cli), unit tests (Vitest), critical-flow E2E (Playwright), lint, typecheck, and a dependency/license audit; merge MUST be blocked on a red pipeline.
- **FR-25** **CD** MUST, on a version tag, build and publish the `web` and `api` Docker images to GHCR, build the single-file client bundle, and attach it plus **SHA-256 checksums** to the GitHub Release.
- **FR-26** The release process MUST produce a **`CHANGELOG.md`** (e.g. via Changesets) and the v1.0 release notes MUST link the completed security review and the launch checklist (§7.4).

## 6. Technical design

### 6.1 Same code, two backends

The crux of "self-host == hosted" is that PRD-07's server is written once against a small storage-agnostic interface and compiled to two targets:

```
                         packages/server (Hono app, handlers, wire format)
                                   │
            ┌──────────────────────┴──────────────────────┐
   Node entrypoint (@hono/node-server)            Workers entrypoint (export default app)
            │                                              │
   StorageDriver = S3 (MinIO/AWS)                 StorageDriver = R2
   MetaDriver    = Postgres                        MetaDriver    = D1 / KV
            │                                              │
   docker compose (self-host)                     wrangler deploy (claudepad.io)
```

- **Handlers never touch a concrete store** - they call `storage.put/get/delete(...)` and `meta.create/get/incrementViews/delete(...)` interfaces owned by PRD-07.
- Drivers are selected at startup from config (`CLAUDEPAD_STORAGE_DRIVER`, `CLAUDEPAD_META_DRIVER`). Trade-off: a thin adapter layer + a small matrix of integration tests (driver × handler) in exchange for genuine parity. We accept the test-matrix cost because parity *is* the product promise.
- The client bundle is identical in both; only runtime `config.js` differs (base URL, limits). This keeps the auditable surface a single artifact (`_context.md` §3 packaging goal).

### 6.2 Configuration loading

- A single `loadConfig()` in `packages/server` reads env (Node: `process.env`; Workers: bound `env`), validates with a schema (zod), applies defaults, and returns a typed `Config`. Invalid config throws at boot (FR-11). The same schema generates the env-reference table in docs (single source of truth → no drift).
- The client receives only the **non-secret** subset (base URL, max size, TTL bounds) via `/config` or a generated `config.js`; secrets never reach the client.

### 6.3 docker-compose sketch

```yaml
# docker-compose.yml  (abridged; full file in repo root)
services:
  web:
    image: ghcr.io/claudepad/web:${CLAUDEPAD_VERSION:-latest}
    # or: build: { context: ., dockerfile: packages/web/Dockerfile }
    environment:
      CLAUDEPAD_BASE_URL: ${CLAUDEPAD_BASE_URL:-http://localhost:8080}
      CLAUDEPAD_API_URL:  ${CLAUDEPAD_API_URL:-http://localhost:8080/api}
    ports: ["8080:80"]
    depends_on:
      api: { condition: service_healthy }

  api:
    image: ghcr.io/claudepad/api:${CLAUDEPAD_VERSION:-latest}
    env_file: .env
    environment:
      CLAUDEPAD_STORAGE_DRIVER: s3
      CLAUDEPAD_META_DRIVER: postgres
      DATABASE_URL: postgres://claudepad:${POSTGRES_PASSWORD}@postgres:5432/claudepad
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET:-claudepad}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
      S3_FORCE_PATH_STYLE: "true"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/readyz"]
      interval: 5s
      timeout: 3s
      retries: 10
    depends_on:
      postgres: { condition: service_healthy }
      createbuckets: { condition: service_completed_successfully }

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: claudepad
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: claudepad
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U claudepad"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY_ID}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_ACCESS_KEY}
    volumes: ["miniodata:/data"]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  createbuckets:
    image: minio/mc
    depends_on:
      minio: { condition: service_healthy }
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $$S3_ACCESS_KEY_ID $$S3_SECRET_ACCESS_KEY &&
      mc mb -p local/$$S3_BUCKET || true"
    environment:
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
      S3_BUCKET: ${S3_BUCKET:-claudepad}

volumes:
  pgdata:
  miniodata:
```

> The `web` container may also be collapsed into the `api` container serving static assets, reducing the stack to three services; the four-service split above is the reference. Reverse-proxy/TLS (Caddy/Traefik) is documented as an optional `compose.prod.yml` overlay so the base path stays minimal.

### 6.4 CI/CD design

- **CI** (GitHub Actions): matrix on Node LTS; jobs = `build`, `test:unit` (Vitest), `test:e2e` (Playwright against a compose-spun stack), `lint`, `typecheck`, `audit` (deps + license). Caching via pnpm store. Required status checks gate merge (FR-24).
- **CD**: on `v*` tag → buildx multi-arch images (`linux/amd64`, `linux/arm64`) pushed to GHCR; build single-file client bundle; compute SHA-256; create GitHub Release with artifacts + checksums; trigger `claudepad.io` Cloudflare deploy from the same tag (FR-25).
- **Reproducibility:** lockfile-pinned installs; image digests recorded in release notes.

### 6.5 Licensing decision

**Recommendation: MIT** (with an alternative note for Apache-2.0).

Rationale:
- The ROADMAP §2 strategy is *maximize trust and adoption* - the value is the auditable zero-knowledge architecture and the hosted instance, not license-enforced exclusivity. A permissive license maximizes self-host, forks, and audit.
- MIT is the lowest-friction, most-recognized permissive license; it imposes no patent or copyleft obligations that would deter contributors or corporate self-hosters.
- **Apache-2.0** is the documented alternative if explicit **patent-grant** protection is desired (relevant given the crypto/secret-handling subject matter); it is still permissive and self-host-friendly. If chosen, add `NOTICE` handling to CI.
- We explicitly do **not** choose a copyleft (GPL/AGPL) license: AGPL's network-use clause would burden the very self-hosters we are courting and conflicts with "no penalty to self-host," and offers little benefit when the codebase is already fully open.

*Open question flagged in §11 for maintainer sign-off.*

## 7. Data model / API, references, tables & trees

PRD-09 introduces **no new API endpoints or data model** - it consumes PRD-07's API and PRD-05's envelope. It adds the operational `GET /healthz` and `GET /readyz` endpoints (FR-4) and a non-secret `GET /config` (or generated `config.js`) for the client (FR-6). The substantive deliverables are the env reference, repo layout, and launch checklist below.

### 7.1 Operational endpoints

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| `GET` | `/healthz` | none | `200 {ok:true}` if process is alive |
| `GET` | `/readyz` | none | `200` if DB + blob store reachable; `503` otherwise |
| `GET` | `/config` | none | non-secret client config (`baseUrl`, `maxBlobBytes`, `ttlDefaultSec`, `ttlMaxSec`) |

### 7.2 Environment-variable reference (single source of truth)

| Variable | Applies to | Default | Required | Description |
|----------|-----------|---------|----------|-------------|
| `CLAUDEPAD_BASE_URL` | web, api | `http://localhost:8080` | yes (prod) | Public origin used to build share links (`…/s/<id>#<key>`). |
| `CLAUDEPAD_API_URL` | web | `${BASE_URL}/api` | no | API origin the client calls. |
| `CLAUDEPAD_VERSION` | compose | `latest` | no | Image tag to run; pin in prod. |
| `LOG_LEVEL` | api | `info` | no | `error\|warn\|info\|debug`; never logs blob bodies/keys (FR-14). |
| `CLAUDEPAD_STORAGE_DRIVER` | api | `s3` | no | Blob backend: `s3` (self-host) or `r2` (Cloudflare). |
| `CLAUDEPAD_META_DRIVER` | api | `postgres` | no | Metadata backend: `postgres`, `d1`, or `kv`. |
| `DATABASE_URL` | api (postgres) | - | yes (if postgres) | Postgres connection string. |
| `S3_ENDPOINT` | api (s3) | - | yes (if s3) | S3-compatible endpoint (e.g. `http://minio:9000`). |
| `S3_REGION` | api (s3) | `us-east-1` | no | Region (MinIO ignores; required by some SDKs). |
| `S3_BUCKET` | api (s3), init | `claudepad` | no | Blob bucket name. |
| `S3_ACCESS_KEY_ID` | api (s3), minio, init | - | yes (if s3) | S3/MinIO access key. **No default.** |
| `S3_SECRET_ACCESS_KEY` | api (s3), minio, init | - | yes (if s3) | S3/MinIO secret key. **No default.** |
| `S3_FORCE_PATH_STYLE` | api (s3) | `true` | no | Path-style addressing (needed for MinIO). |
| `POSTGRES_PASSWORD` | postgres, api | - | yes (self-host) | DB password. **No default.** |
| `CLAUDEPAD_MAX_BLOB_BYTES` | api | `10485760` (10 MiB) | no | Max accepted ciphertext blob size; reject larger (per PRD-07 limits). |
| `CLAUDEPAD_TTL_DEFAULT_SEC` | api | `604800` (7 d) | no | Default expiry when sharer doesn't pick one. |
| `CLAUDEPAD_TTL_MAX_SEC` | api | `2592000` (30 d) | no | Max allowed TTL; `0` ⇒ no expiry permitted as default unless overridden. |
| `CLAUDEPAD_BURN_DEFAULT` | api | `false` | no | Whether burn-after-read is on by default. |
| `CLAUDEPAD_RATE_CREATE_PER_MIN` | api | `30` | no | Per-IP create (upload) requests/min (abuse control, PRD-07). |
| `CLAUDEPAD_RATE_FETCH_PER_MIN` | api | `120` | no | Per-IP fetch requests/min. |
| `CLAUDEPAD_ALLOWED_ORIGINS` | api | `${CLAUDEPAD_BASE_URL}` | no | CORS allowlist; comma-separated. |
| `CLAUDEPAD_TRUST_PROXY` | api | `false` | no | Honor `X-Forwarded-For` for rate-limit IP behind a proxy. |

> Defaults are illustrative and must be reconciled with PRD-07's authoritative limits at implementation; where they differ, PRD-07 wins and this table is updated.

### 7.3 Repository / monorepo layout

```
claudepad/
├─ README.md                  # product + two quick-starts + verify-ZK
├─ LICENSE                    # MIT (or Apache-2.0) - §6.5
├─ SECURITY.md                # disclosure policy, supported versions (FR-17)
├─ CONTRIBUTING.md            # setup, build, test, PR & release process (FR-21)
├─ CHANGELOG.md               # generated (Changesets) (FR-26)
├─ docker-compose.yml         # self-host reference stack (FR-1)
├─ compose.prod.yml           # optional TLS/reverse-proxy overlay
├─ .env.example               # safe localhost defaults (FR-1)
├─ pnpm-workspace.yaml
├─ package.json               # root scripts: build/test/lint/typecheck/dev
├─ .github/workflows/
│  ├─ ci.yml                  # build, test, e2e, lint, audit (FR-24)
│  └─ release.yml             # tag → images + bundle + checksums (FR-25)
├─ docs/
│  ├─ ROADMAP.md  SECURITY-MODEL.md
│  ├─ THREAT-MODEL.md         # public, plain-language (FR-15)
│  ├─ self-hosting.md  configuration.md  deploy-cloudflare.md
│  └─ prd/  (this folder)
└─ packages/
   ├─ shared/                 # normalized Session types + envelope format (PRD-02/05) - single source
   ├─ web/                    # Vite + React client → single static bundle (PRD-01/03/04/08)
   │  └─ Dockerfile
   ├─ server/                 # Hono app + storage/meta drivers (PRD-07)
   │  ├─ src/adapters/{node,workers}.ts
   │  ├─ src/storage/{s3,r2}.ts
   │  ├─ src/meta/{postgres,d1,kv}.ts
   │  ├─ wrangler.jsonc       # Cloudflare config (FR-10)
   │  └─ Dockerfile
   └─ cli/                    # `claudepad` one-shot upload (PRD-04)
```

### 7.4 v1.0 launch checklist (maps to ROADMAP §6 success metrics)

**Product / metrics**
- [ ] **Time-to-share < 15s** verified end-to-end (Playwright timing on the share flow). *(ROADMAP §6)*
- [ ] **Zero-knowledge verifiable**: documented capture/script (FR-18) shows upload contains no plaintext transcript or secret. *(ROADMAP §6)*
- [ ] **Self-host < 5 min**: timed `docker compose up` → share→view round-trip on the reference machine (FR-2). *(ROADMAP §6)*
- [ ] **Parser resilience**: renders the last N released Claude Code formats from the fixture corpus without crashing; unknown fields degrade gracefully (PRD-02). *(ROADMAP §6)*
- [ ] **Secret recall ≥ documented threshold** on the labeled corpus, FPs reviewable/dismissable (PRD-06). *(ROADMAP §6)*

**Security gates (hard blockers)**
- [ ] Public `docs/THREAT-MODEL.md` complete and consistent with `SECURITY-MODEL.md` (FR-15).
- [ ] Independent security review of crypto core (PRD-05) + secret handling (PRD-06) **complete; all critical/high resolved or formally accepted** (FR-16).
- [ ] `SECURITY.md` disclosure policy published (FR-17).
- [ ] Server proven to never log plaintext/keys (FR-14 test).

**Deployment / parity**
- [ ] `docker compose up` green from clean clone with unedited `.env.example` (FR-1, FR-3).
- [ ] Cloudflare deploy of `claudepad.io` from the release tag (FR-8/10); wire format byte-identical to self-host (FR-9).
- [ ] Published, version-pinned Docker images on GHCR (FR-5).
- [ ] Env-var reference (§7.2) matches `loadConfig()` schema (no drift).

**Open-source readiness**
- [ ] LICENSE chosen + applied; dependency license audit green (FR-19).
- [ ] README, CONTRIBUTING, CHANGELOG present and accurate (FR-21/22/26).
- [ ] CI required on PRs; CD on tags produces bundle + checksums (FR-24/25).
- [ ] SemVer + documented envelope/wire-format version (FR-23).

## 8. Security & privacy

How this PRD conforms to `_context.md` §5 / `SECURITY-MODEL.md`:

- **Zero-knowledge preserved across deployments (§5.1):** both backends store only ciphertext + metadata; no driver may decrypt. Parity (FR-7/9) ensures self-host is not a weaker variant.
- **No new plaintext surface:** PRD-09 adds only operational endpoints (`/healthz`, `/readyz`, `/config`) that expose no session data. `/config` is the non-secret subset only.
- **Honest threat model surfaced, not buried (§5.7):** FR-15 makes `THREAT-MODEL.md` a launch deliverable, explicitly documenting metadata leakage (size/timing/IP/access counts), URL-fragment leakage, best-effort redaction limits, and recipient-re-leak/endpoint-compromise being out of scope.
- **Gating review (SECURITY-MODEL "Pre-v1 requirement"):** FR-16 hard-gates v1.0 on the independent review of PRD-05/06. No tag without it.
- **Operational hygiene:** FR-14 forbids logging secrets/keys/blob bodies even at debug; required secrets have no defaults (FR-12) to prevent insecure-default deployments; rate limits and CORS (FR-12) are first-class config to curb abuse without inspecting content.
- **Risks introduced by this PRD:** (a) a misconfigured `CLAUDEPAD_BASE_URL` could mint unreachable/leaky links - mitigated by the first-run banner (§4.1) and prod-required validation (FR-11). (b) Publishing pre-built images creates a supply-chain surface - mitigated by pinned digests, checksums, and multi-arch reproducible builds (FR-25). (c) Adding a third storage driver could diverge behavior - mitigated by the driver×handler integration matrix (§6.1).

## 9. Dependencies

**Upstream (must be complete/usable before P5 ships):**
- **PRD-01** Design System & **PRD-03** Viewer - produce the single static client bundle this PRD packages.
- **PRD-02** Parser & shared types - the `shared` package consumed monorepo-wide.
- **PRD-04** Ingest/CLI - the `cli` package included in the repo/release.
- **PRD-05** Crypto core & **PRD-06** Secrets - **gating**: this PRD's launch is blocked on their independent security review (FR-16).
- **PRD-07** Backend Blob Store & API - this PRD *deploys* it via both the Node/Postgres/S3 and Cloudflare/R2/D1-KV adapters; depends on its storage interface and wire format.
- **PRD-08** Playback - part of the bundled client; not a hard blocker but expected in the v1.0 feature set.

**Downstream:** none - PRD-09 is the terminal launch PRD (ROADMAP P5 → v1.0).

**External:** Docker/Compose, Postgres, MinIO, Cloudflare (Workers/R2/D1/KV), `wrangler`, GitHub Actions/GHCR, an independent security reviewer (vendor TBD - §11).

## 10. Acceptance criteria / DoD

- [ ] All launch-blocking FRs (FR-1…FR-26) satisfied; each has a corresponding test or documented verification.
- [ ] From a clean machine: `git clone` → `cp .env.example .env` → `docker compose up` yields a working share→view round-trip in **< 5 min** (FR-1/2/3).
- [ ] `claudepad.io` deploys from the release tag on Cloudflare; a share created on self-host's wire format is structurally identical to hosted (FR-8/9/10).
- [ ] Env-var reference (§7.2) is generated from / matches the server config schema; startup fails fast on invalid config (FR-11/12/13).
- [ ] `docs/THREAT-MODEL.md`, `SECURITY.md` published; consistent with `SECURITY-MODEL.md` (FR-15/17).
- [ ] Independent security review of PRD-05/06 **completed and signed off**; critical/high findings resolved or accepted with documented rationale (FR-16).
- [ ] Zero-knowledge verification procedure documented and passing (FR-18).
- [ ] LICENSE applied; dependency license audit green (FR-19).
- [ ] Monorepo layout (§7.3) in place; `README`, `CONTRIBUTING`, `CHANGELOG` present and accurate (FR-20/21/22/26).
- [ ] CI green and required on PRs; CD publishes images + single-file bundle + SHA-256 checksums on tag (FR-24/25).
- [ ] SemVer adopted; envelope/wire-format version documented (FR-23).
- [ ] **v1.0 launch checklist (§7.4) fully checked**, with every ROADMAP §6 metric traced to a passing verification.

## 11. Open questions

1. **License sign-off (§6.5):** MIT (recommended) vs. Apache-2.0 (explicit patent grant). Given the crypto/secret-handling subject matter, does the maintainer want the Apache-2.0 patent protection at the cost of slightly more ceremony (NOTICE handling)? *Needs maintainer decision.*
2. **Security reviewer selection & scope:** which independent firm/auditor reviews PRD-05/06, what is the exact scope (crypto core + secret scanner + envelope construction), budget, and timeline? This is on the critical path to v1.0 (FR-16).
3. **Web container packaging:** ship `web` as a separate static server (4-service compose) or fold static assets into the `api` container (3-service, simpler) - which is the reference? Trade-off: minimal stack vs. clean separation/scaling.
4. **TTL/limit defaults:** §7.2 defaults (10 MiB blob, 7 d default / 30 d max TTL, rate limits) must be reconciled with PRD-07's authoritative numbers - confirm or override.
5. **Cloudflare metadata store:** D1 vs. KV for hosted metadata (PRD-07 leaves both open). Burn-after-read and view-count semantics differ in atomicity guarantees between them - which does hosted commit to, and does self-host's Postgres need to match those exact semantics for true parity (FR-9)?
6. **Reference machine for the < 5 min metric:** confirm the spec (4 vCPU / 8 GB) and whether the timer assumes pre-pulled published images or a cold local build - this materially changes whether FR-2 passes.
7. **Multi-arch image scope:** are `linux/arm64` images (Apple Silicon / ARM servers) in-scope for v1.0 CD, or amd64-only at launch with arm64 fast-follow?
8. **Hosted abuse/DMCA path:** `claudepad.io` operators may receive takedown requests for content they cannot read - confirm the metadata-only removal process (delete by `id`) and document it, since it touches the zero-knowledge story.

## 12. Phase / milestone

**Phase P5 - Launch**, the terminal milestone delivering **v1.0** (ROADMAP §3). Build order: last on the critical path (`… → PRD-08 → PRD-09`), gated on the PRD-05/06 security review. Shipping this PRD's acceptance criteria *is* the v1.0 release.
