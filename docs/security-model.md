# claudepad - Security & Crypto Model

> **v1 status (serverless pivot, 2026-06-20):** v1 is **entirely client-side and trustless** - the canonical v1 design now lives in **[`trustless-model.md`](./trustless-model.md)** (identity, encrypt-to-recipient, fingerprints, device keys), proven by the crypto conformance suite (`packages/crypto/test/conformance.test.ts`). **This document's "Layer 1 (link/fragment)" and "Lifecycle" sections describe the deferred *server* model (vNext, DECISIONS D-29)** and are retained for that future. The threat-model *framing* and the **two-key tiering / placeholder rules** below still hold - in v1 the two content keys are *wrapped to a recipient's public key* instead of placed in a URL fragment. PRD-05/06/10/11 conform to `trustless-model.md`; PRD-07 (backend) is vNext.

> The spine of the product. This is the canonical, plain-language write-up of how claudepad protects sessions and secrets, and - honestly - what it does *not* protect. A condensed version lives in `prd/_context.md` §5.

## Goals

1. The host (including claudepad.io) **cannot read** a shared session.
2. A sharer can reveal or hide **embedded secrets per recipient tier**, cryptographically.
3. Self-hosting carries **no security penalty** vs. the hosted instance.
4. The threat model is **documented in plain language**, not buried.

## Threat model

**In scope (defended):**
- A curious or compromised *server operator* reading session content or secrets.
- A passerby with a low-privilege link reading secrets they shouldn't.
- Accidental publication of `.env`/token values to a broad audience.

**Out of scope (explicitly not defended in v1):**
- A recipient who legitimately receives a key and then leaks content/keys onward (social trust problem, not crypto).
- Endpoint compromise of the sharer or viewer (malware, keylogger).
- Traffic-analysis metadata: the server still learns blob size, timing, access counts, and IP.
- Best-effort redaction gaps (see "Limits").

## Layer 1 - Zero-knowledge baseline (PrivateBin model)

1. The browser/CLI generates a random **AES-256-GCM** content key.
2. Content is encrypted **client-side**; only ciphertext is uploaded.
3. The key is placed in the **URL fragment** (`https://claudepad.io/s/<id>#<key>`). Browsers never send the fragment to the server, so a fully cooperative or compromised server cannot decrypt.
4. The server stores `{ id → ciphertext + metadata }` and nothing else sensitive.

## Layer 2 - Two-key tiered reveal (the differentiator)

Split the artifact into two independently-encrypted layers:

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│ BODY (redacted transcript)  │        │ SECRET MAP               │
│ secrets → ⟦S1⟧ ⟦S2⟧ …       │        │ { S1: "sk-live-…",       │
│ encrypted with K_body       │        │   S2: "ghp_…" }          │
└─────────────────────────────┘        │ encrypted with K_secret  │
                                        └──────────────────────────┘
        both ciphertexts uploaded; server can read neither
```

Tier is determined purely by **which keys a link carries**:

| Link | Fragment | Viewer sees |
|------|----------|-------------|
| Low-privilege | `#<K_body>` | Transcript with `[AWS_KEY ••••••••(20)]`-style placeholders |
| High-privilege | `#<K_body>.<K_secret>` | Same transcript, with real secret values substituted back in |

One uploaded artifact, two trust tiers, host blind to both.

### Why two keys, not one document with "hidden" fields
Hiding must be cryptographic, not UI-level. If the secret values were inside the body ciphertext, anyone who could read the body (every tier) could read the secrets. Separating into a second ciphertext with its own key makes "low-priv cannot see secrets" a mathematical fact.

## Placeholder design (correction to the original `[SHA512:…]` idea)

The original idea was to replace a secret with `secret is [SHA512:…]`. We **do not** do this:

- A hash is **one-way** - a high-privilege viewer could never recover the plaintext, defeating tiered *reveal*.
- For **low-entropy** secrets (passwords, short tokens), a published hash is **brute-forceable offline**, leaking the secret to everyone.

Instead:
- Each detected secret is replaced by an **opaque random ID** (`S1`, `S2`, …) that indexes the encrypted secret map.
- The rendered placeholder shows only a **type + length** hint, e.g. `[AWS_KEY ••••••••(20)]` - enough to disambiguate, leaking neither the value nor a crackable fingerprint.

## Limits - best-effort redaction (must be surfaced, never hidden)

- Secret **detection** = known token prefixes (`sk-`, `ghp_`, `AKIA…`, JWT shape, PEM blocks, …) + Shannon-entropy heuristics + any user-supplied `.env`/`.dev.vars` values to match exactly.
- A **missed** secret remains in plaintext inside the `K_body` layer. It is still protected from the host, but it is visible to **every tier**, including low-privilege.
- Therefore the **review-before-share step is mandatory and load-bearing**: users see all detections, can add/remove/edit them, and confirm before anything is uploaded. We never auto-publish.

## Lifecycle controls

- **Expiry (TTL)** and **burn-after-read** are enforced on server-side metadata; content stays encrypted regardless.
- Burn-after-read deletes the blob on first successful fetch (with the documented race/edge caveats).

## Key-handling hygiene (client responsibilities)

- Keys live only in memory and in the URL fragment; never logged, never sent in query/body/headers.
- Guard against fragment leakage: avoid `Referer` exposure, consider stripping the fragment from the visible address bar after load, warn users that the link *is* the credential.
- Use authenticated encryption (GCM) so tampering is detectable.

## vNext - named-recipient / PGP-style sharing (not in v1, not precluded)

- Each user holds an **X25519** keypair (passkey- or password-derived).
- `K_body` / `K_secret` are **wrapped to each recipient's public key**; the server stores only wrapped keys.
- Recipients prove key possession, fetch their wrapped keys, and unwrap locally.
- Enables **revocation, per-person tiers, and audit logs** while staying zero-knowledge.
- v1 link-sharing must be designed so this can be added without re-architecting the blob/key model.

## Pre-v1 requirement

A written threat-model section in the public docs **and** an independent security review of the crypto core (PRD-05) and secret handling (PRD-06) are gating items for the v1 launch (PRD-09).
