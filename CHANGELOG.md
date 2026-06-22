# Changelog

All notable changes to claudepad are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/). The blob/identity **envelope version**
(currently `1`) is tracked independently of the product version.

## [Unreleased]

## [0.7.0] - 2026-06-22 - P5 (Self-Hosting & Launch)

### Added
- `LICENSE` (MIT) at the repo root.
- Public, plain-language `docs/THREAT-MODEL.md` - what v1 defends, what it consciously gives up, and the crypto, named.
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
