# Changelog

All notable changes to claudepad are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/). The blob/identity **envelope version**
(currently `1`) is tracked independently of the product version.

## [Unreleased]

## [0.16.0] - 2026-09-13 - Usage Insights: delegation, parallelism & real limits

### Added
- **Subagent work is now visible (D-97):** `scanVault` never descended into `<project>/<sessionId>/subagents/`, so roughly **14% of tokens were missing** from every total. Delegated runs are scanned, deduped and summed into all figures, but counted as `agentRuns` - never as `sessions` - with a new `byAgentType` split and a **Delegation** panel (share of tokens delegated, runs per session, top agent types).
- **Parallelism (D-98):** `usage/concurrency.ts` measures time-weighted concurrent *top-level* sessions (5-minute slots, 10-minute bridge), surfaced as an "At once" metric card and a **Sessions in parallel** panel. Insensitive to the bridge parameter (mean moves 1.59x -> 1.73x across a 5m-30m sweep).
- **Limit hits (D-99):** `quotaLimits` rejection blocks are lifted into `EventBase.limit`, and an honest event log reports incidents, affected days and blocked duration - what actually got refused, not an estimate.
- **Scorecard** gained cost, average/peak parallelism, busy hours, delegation share and limit incidents.
- **What your plan actually meters (PRD-14, D-100):** calibrated by regressing 9,571 measured `utilization` readings against real token spend, **cache reads are free to the subscription meter** - only fresh input + output + cache writes count. For a heavy agentic user that is ~74% of the API-equivalent cost invisible to the limit, which is why quota burn feels unrelated to the dollar estimate. Metered over a 5h tumbling window anchored to first use, a weekly window resetting Sun 04:00Z, and a Fable-scoped weekly sub-limit. Bundled Max 20x budgets ($75 / $528 / $118) are reverse-engineered from a single account, labelled as such, editable, and superseded by self-calibration the moment a quota log is imported. Three quality gates (monotone filtering, max-gap, unexplained-rise) stop a partial import from producing confidently wrong budgets.
- **Dev-only for now** via `QUOTA_PANEL_ENABLED` (`usage/availability.ts`, mirroring `REGISTRY_ENABLED`), since the quota log it calibrates against is not something most users have. `VITE_QUOTA_PANEL=true` re-enables it in a production build.

### Fixed
- **Est. cost was ~10x too low (D-96):** `DEFAULT_PRICING` was missing `claude-opus-5`, `claude-fable-5-1` and `claude-sonnet-5`, and an unpriced model silently contributed **$0** - `costOfByModel` only raised the `unpriced` flag when *nothing* was priced. A vault that is 93% Opus 5 therefore reported **$524** instead of **~$4.9K**. The table now covers the current tiers, `rate()` takes a cache-read override (Fable 5.1 reads flat at $0.25/MTok), `canonicalModel` strips a `[1m]` context suffix, and `CostBreakdown.unpricedShare` renders any future gap as a visible `>$X` floor instead of a confident wrong number.
- **Second page scrollbar:** Tailwind's `sr-only` is `position: absolute`, so a visually-hidden file input inside the scrolling `<main>` resolved against the initial containing block, landed at its flow offset deep in the content and stretched the document to 1277px against a 987px viewport. `<main>` is now `relative`, containing any absolutely-positioned descendant.

### Internal
- Shared `newDeduper`/`dedupedRecords` helpers; file-aggregate cache bumped to `file-aggregates-v3`.

## [0.15.0] - 2026-06-27 - Registry gated off for launch

### Changed
- **The registry surface is disabled in production builds (D-95)**, shown as "coming soon" pending the independent security review. Dev builds keep it on and `VITE_REGISTRY_ENABLED=true` re-enables it in a production build.

## [0.14.1] - 2026-06-27 - Scorecard export fix

### Fixed
- **Scorecard Download / Copy buttons did nothing:** the canvas `toBlob` wrapper resolved to `null` before the image was ready (`toBlob` returns void, so a `?? resolve(null)` fallback always fired first), so both actions bailed silently. Both now produce the PNG.

## [0.14.0] - 2026-06-27 - Claude scorecard generator

### Added
- **Shareable scorecard (D-94):** a "Scorecard" button in the Usage Insights header opens a dialog that renders a fixed 1200×630 social-share card on a hand-rolled canvas (2× → a 2400×1260 PNG), with Download and Copy-to-clipboard. It pairs vanity metrics (total tokens, est. cost, sessions, projects, active days, top model) with the **metrics that matter** - cache-read ratio + an A–E cache grade, average context/turn, and reset discipline (share of sessions kept under a 1M-token lean line). Colors and fonts come from the live design tokens so the card matches your theme. **Anonymous by default** (no project names, only the count); an opt-in toggle stamps your identity's emoji fingerprint + name. Rendered entirely locally - nothing is uploaded.

## [0.13.0] - 2026-06-26 - Usage Insights dashboard

### Added
- **Usage Insights (PRD-13, D-91…D-93):** a local, private analytics view (`#/usage`) over the sessions the vault already reads - where your tokens, cost, and time went, global vs per project, computed in the browser with nothing uploaded. Token usage is lifted into the normalized schema, rolled up under a Web-Worker compute with a per-file aggregate cache, and priced from a bundled, dated, editable table (cache-tier-aware). Includes day-granular project/date filtering, a Recharts trend/histogram/model breakdown, a weekday×hour heatmap, and labeled Real Spend / effort estimates.

### Fixed
- **Cross-file token dedup (D-93):** Claude Code copies the same assistant turn into resumed/sidechain files with fresh UUIDs; the roll-up now deduplicates on `message.id` (matching `ccusage`), fixing a >2× over-count of totals and cost.

## [0.12.1] - 2026-06-26 - Docs cleanup + code-quality pass

### Changed
- **Docs reorganized (D-90):** the implemented per-phase PRDs were removed (only the vNext `prd-07-backend` and the canonical `_context` survive; `prd/README` is now a pointer); every `docs/` file was renamed to lower-case-dash (`registry-spec.md`, `trustless-model.md`, `verify-zero-knowledge.md`, ...), with root files keeping the standard uppercase. Retired `poc/` references now point to `packages/crypto/test/conformance.test.ts`, and stale `packages/{client,shared,secrets}` paths, the dropped `verify:poc` command, and the security-review-as-hard-gate framing (now post-launch per D-78) were corrected across CLAUDE.md, README, CONTRIBUTING, SECURITY, and the docs set.

### Fixed
- **Registry blob expiry:** a non-numeric `expiresInSeconds` no longer produces a blob that never expires; the value is validated and rejected when invalid.

### Internal
- Code-quality pass from a session audit: a shared `idbKv` helper (dedups identical IndexedDB code), `useCopy` reuse in the code/link copy buttons, dead-export removal (`MarkLines`, `minIso`/`maxIso`/`isBefore`), dropping the no-op `resolveRecipientPub` wrapper, and deduping the `ab()` helper via `@claudepad/crypto`.

## [0.11.0] - 2026-06-23 - Easy registry default + streamlined sharing

### Added
- **Recommended registry default** (D-88, relaxes D-33): `registry.claudepad.io` is now an easy, opt-out default. Onboarding's name step has a pre-checked "List me on registry.claudepad.io" box (with a Learn-more link) that, on create, checks the handle is free, mints, and publishes your public card; the registry popover leads with a one-click "Use registry.claudepad.io" plus a smaller "Add a custom registry". Sharing still works fully offline; the URL is a single swappable constant, allow-listed in the no-external-origins gate.
- **Inbox entry point**: a sidebar-footer **"Open a share"** opens the receive flow, which lists what's shared with you on the connected registry ("Shared with me") and accepts a pasted blob / link.

### Changed
- The share dialog's fingerprint-confirm step is gone (recipients insta-add); fingerprints render as emoji or hex per a new Settings toggle (emoji default); the tier picker moved into the recipient step's footer; the result step auto-creates a share link with Copy/Download. (Carried from the share-flow rework.)

## [0.10.0] - 2026-06-23 - Share short links + frictionless open

### Added
- **First-launch onboarding wizard** (`client/src/onboarding/**`, D-81): auto-opens once (persisted `claudepad.onboarded` flag), re-runnable via a "Take the tour" entry in the sidebar footer. A few quick how-to steps, then an inline **name-only identity generator** so a new user lands ready to share.
- **Registry-issued share short links** (D-87): a registry can advertise a paired web app (`manifest.webApp`) and serve a clickable `…/s/<id>` link that 302-redirects into it (`?share=<id>&r=<baseUrl>`). The client opens such a link straight away - it fetches the opaque blob from the registry named in the link, so it works even for a recipient who never connected that registry. New `/s/{id}` endpoint, `webApp` manifest field, and `SHARE_ID_PARAM`/`SHARE_REGISTRY_PARAM` in `@claudepad/registry-spec`; `REGISTRY_WEB_APP` env var on the reference Worker.

### Changed
- **Opening a decrypted share is no longer gated** (D-87): a received blob goes straight to the viewer (the sender's name rides along as the session label) instead of an intermediate "View session" confirmation - viewing a session is not a risk (frictionless-first).
- The Quick Share dialog now shows each recipient as **name + emoji fingerprint** (hex kept in the accessible label).

### Fixed
- The Appearance popover's **Mode** (Light/Dark/System) and **Palette** (Contrast) buttons no longer overflow their width.

## [0.9.0] - 2026-06-22 - Registry (optional store + identity directory addon)

### Added
- **`docs/registry-spec.md`** - the open registry contract (absorbs/extends `store-provider-spec.md`): three trust axes (availability / authenticity / confidentiality), zero-knowledge by default with an opt-in trusted mode, and an identity directory with a registry-declared assurance level (`self`/`domain`/`sso`). Decisions D-74…D-80.
- **`@claudepad/registry-spec`** - the contract as a zero-dep package: provider interfaces, wire DTOs, endpoint paths, typed errors, the HTTPS-only guard, a tolerant manifest parser, and the OpenAPI 3.1 document (on a `/openapi` subpath, kept off the client bundle).
- **`@claudepad/registry`** - Cloudflare Worker reference implementation (R2 blobs/sessions + KV directory/inbox) over a storage-agnostic handler, with an in-memory backend for tests/local dev.
- **`@claudepad/registry-client`** - framework-agnostic `fetch` SDK that works against any conformant registry (no hardwired URL, HTTPS-only at connect), with a conformance suite run against the reference impl.
- **Client integration** (opt-in, null by default): connect a registry, short-link upload + receive-by-id, share-by-name via the directory, publish-your-identity, opt-in inbox, and consent-gated trusted-mode publish. Every flow still works with no registry; `check-no-external-origins` stays green.

### Changed
- The independent security review is **reclassified from a v1.0 hard gate to a post-launch recommendation** (D-78); `docs/threat-model.md` now states plainly that the crypto is unaudited and an audit is welcome.

## [0.8.0] - 2026-06-22 - Viewer themes (aesthetic palette axis)

### Added
- **Viewer themes** (PRD-12, D-71…D-73): an aesthetic palette axis (`<html data-viewer-theme>`) orthogonal to functional light/dark - 4 palettes (`warm`/`slate`/`ocean`/`contrast`), each a token-override block per mode, with a single **Appearance** popover for mode + palette. `check-contrast` validates every palette × mode.

## [0.7.0] - 2026-06-22 - P5 (Self-Hosting & Launch)

### Added
- `LICENSE` (MIT) at the repo root.
- Public, plain-language `docs/threat-model.md` - what v1 defends, what it consciously gives up, and the crypto, named.
- `SECURITY.md` - vulnerability-disclosure policy, scope, and supported versions.
- `CONTRIBUTING.md` - setup, monorepo layout, the gate, conventions, and the release process.
- `docs/self-hosting.md` - self-host = serve the static bundle (any host / Cloudflare), no server, no DB.
- `docs/verify-zero-knowledge.md` + `scripts/check-no-external-origins.mjs` - reproducible zero-knowledge verification (crypto conformance, bundle has no third-party fetches, live network capture).
- `CHANGELOG.md` (this file).
- GitHub Actions CI (gate + E2E) and tag-driven release/deploy workflows.

### Changed
- `README.md` rewritten for the v1 launch: current state, what it is, use + self-host quick-starts, verify-ZK.

### Notes
- The independent security review of the crypto core (PRD-05) and secret handling (PRD-06) remains the hard gate on the v1.0 tag (PRD-09 FR-16).
- PRD-09's server stack (`docker compose` + Postgres + MinIO + Workers/R2) is the **vNext store addon**, not part of the serverless v1 launch.

## [0.6.1] - P3 hardening (secrets)

### Fixed
- Redact every string in the session, not just scannable content, closing a leak path in the body layer.

## [0.6.0] - P3 hardening (D-58)

### Added
- Web-Worker secret scan (off the main thread).
- Labeled detection corpus with recall numbers.
- Advanced review: edit-span / merge / sensitivity slider.
- Address book of known recipients.
- Multi-recipient single blob.

### Changed
- Playback folds tool-runs and idle gaps; added a ≥5k-event perf smoke.

## [0.5.0] - Client platform upgrade

### Changed
- Integrated a custom shadcn fork and upgraded to React 19.
- UI/UX refinements; Cloudflare `wrangler` config for static deploy.

## [0.4.0] - P4 (Playback)

### Added
- Session playback and presentation mode (PRD-08): pure timeline engine, rAF clock, in-flow transport bar with scrubber, settings popover, keyboard map, deep-link params, progressive reveal + active highlight.

### Changed
- Ingest / share-entry and viewer polish.

## [0.3.0] - P3 (Trustless Sharing - the moat)

### Added
- Encrypt-to-recipient sharing (PRD-11) and the `@claudepad/secrets` scanner/redactor (PRD-06): mandatory secret review → recipient + fingerprint confirm → tier (body / body+secrets) → `cp-blob-…` output. Receive/decrypt with fail-closed lockout for non-recipients.

### Changed
- Sidebar refinements: collapsible, brand-nav Open, unlink folder.

## [0.2.0] - P2 (Identity & Trust) + frictionless ingest

### Added
- Client-side ECDH P-256 identity (PRD-10): mint/import, `none → locked → unlocked` state machine, public-key card + identity secret export, emoji+hex fingerprint, optional WebAuthn-PRF device protection.
- Post-P1 frictionless UX: File System Access folder-connect vault and a unified top bar (breadcrumbs + context + actions).

## [0.1.0] - P0 (Foundation) + P1 (MVP-0)

### Added
- Monorepo scaffold, `@claudepad/schema` tolerant parser (PRD-02), `@claudepad/shared` zero-dependency WebCrypto core (PRD-05) mirroring `poc/`, and the design system (PRD-01).
- P1 (MVP-0): drop/paste a session → prettified `SessionViewer` (PRD-03) fed by `@claudepad/ingest` (PRD-04), fully offline and local-only.

[Unreleased]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tobiasstrebitzer/claudepad/compare/v0.1.0...v0.4.0
[0.1.0]: https://github.com/tobiasstrebitzer/claudepad/releases/tag/v0.1.0
