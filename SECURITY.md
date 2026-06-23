# Security Policy

claudepad's whole purpose is to protect the sessions and secrets you share. We take vulnerability reports seriously and want to make reporting easy.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through one of:

- **GitHub Security Advisories** - the preferred channel: open a private advisory at
  <https://github.com/tobiasstrebitzer/claudepad/security/advisories/new>.
- **Email** - `tobias.strebitzer@atomic.bi` with `[claudepad security]` in the subject.

Please include, as far as you can:

- a description of the issue and its impact,
- the version / commit you tested,
- reproduction steps or a proof of concept,
- and any suggested remediation.

If your report concerns the crypto core ([`packages/shared`](packages/shared)) or secret detection ([`packages/secrets`](packages/secrets)), a self-contained failing case against [`poc/verify.mjs`](poc/verify.mjs) or a unit test is the most actionable form.

## What's in scope

claudepad v1 is **entirely client-side** - there is no server. The highest-value reports concern:

- **Crypto core** ([`packages/shared`](packages/shared)) - identity, ECDH-to-recipient wrapping, the two-key tiered envelope, fingerprints. Anything that lets a non-recipient decrypt a blob, lets a body-only recipient recover secrets, or weakens the envelope is **critical**.
- **Secret detection & redaction** ([`packages/secrets`](packages/secrets)) - a missed secret that should plausibly have been caught, a placeholder that leaks the underlying value, or a way to defeat the review step.
- **Identity & device keys** - key extraction, weakening of WebAuthn-PRF wrapping, or storage that exposes an at-rest private key.
- **Client web hygiene** - XSS, content-injection, or any third-party-script/CDN path that could exfiltrate an unlocked key. The single-static-bundle, no-CDN posture is a security property; regressions to it are in scope.

## What's out of scope

These are documented non-goals of v1 (see [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md)), not vulnerabilities:

- Availability / loss of a blob the user didn't keep (no server by design).
- Revocation, expiry, or burn-after-read (no server by design).
- A recipient who legitimately decrypts and then re-shares.
- Endpoint compromise (malware, keyloggers, malicious browser extensions).
- A determined MITM on your out-of-band fingerprint-verification channel.
- Best-effort redaction *gaps that are inherent* (a secret with no detectable shape and not supplied via `.env`); a detector that misses a clearly-shaped, common secret **is** in scope.

## Disclosure process

- We aim to **acknowledge** a report within **5 business days**.
- We aim to provide an initial **assessment** within **10 business days**.
- We practice **coordinated disclosure**: we'll agree on a disclosure timeline with you and credit you (unless you prefer otherwise) once a fix or mitigation is available.
- Critical/high findings in the crypto core or secret handling are **launch-blocking** for any v1.0 tag (see [`docs/prd/PRD-09-selfhost-launch.md`](docs/prd/PRD-09-selfhost-launch.md) FR-16).

## Supported versions

claudepad is pre-1.0. Only the **latest released version** (and `master`) receives security fixes until v1.0; from v1.0 onward, the latest minor line is supported.

| Version | Supported |
|---------|-----------|
| latest `0.x` / `master` | ✅ |
| older `0.x` | ❌ (upgrade) |

## Verifying the security claims yourself

You don't have to trust us:

- Run the crypto conformance anchor: `node poc/verify.mjs` (non-recipient lockout, tiered decrypt, no-plaintext-in-blob, fingerprint stability, device-key wrap).
- Verify zero-knowledge for yourself: follow [`docs/VERIFY_ZERO_KNOWLEDGE.md`](docs/VERIFY_ZERO_KNOWLEDGE.md) (a network capture shows nothing leaves the browser).
