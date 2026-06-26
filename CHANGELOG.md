# Changelog

All notable changes to claudepad are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/). The blob/identity **envelope version**
(currently `1`) is tracked independently of the product version.

## [Unreleased]

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
