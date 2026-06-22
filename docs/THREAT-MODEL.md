# claudepad - Threat Model (plain language)

> This is the public, plain-language threat model for **claudepad v1**. It explains, honestly, what claudepad protects, what it does **not**, and why. It is consistent with the canonical design docs - [`TRUSTLESS-MODEL.md`](./TRUSTLESS-MODEL.md) (the v1 spine, proven by [`../poc/`](../poc/)) and [`SECURITY-MODEL.md`](./SECURITY-MODEL.md) (threat-model framing) - and condensed from them for a general audience. Where this document and those disagree, those win.

## The one-sentence version

claudepad turns a Claude Code session into an encrypted blob that **only one chosen recipient can read** - and it does this **entirely in your browser, with no server in the data path**, so there is no host that *could* read it.

## How it works (just enough to reason about trust)

1. **There is no server.** claudepad v1 is a static web page. Parsing your session, minting your identity, encrypting, and decrypting all happen locally in the browser (or while self-hosting the same static files). Nothing is uploaded.
2. **You have an identity** - an ECDH P-256 keypair minted in your browser and stored locally. You never create an account.
3. **Sharing = encrypting to a recipient's public key.** You paste the recipient's public-key card, claudepad encrypts the session *to that key*, and produces a self-contained **blob** (`cp-blob-…`). You carry the blob anywhere - Slack, email, a `.cpad` file.
4. **Only the matching private key decrypts it.** The recipient opens the blob with their identity. Anyone else gets nothing: AES-GCM authentication fails under the wrong key.
5. **Secrets get a second, independent key.** Detected secrets are pulled out of the transcript into a separate encrypted map. You choose, per recipient, whether to grant *body only* (transcript with `⟦cp-secret:…⟧` placeholders) or *body + secrets* (real values revealed). "Low tier cannot see secrets" is a mathematical fact, not a UI toggle.
6. **Trust is verified by fingerprint.** Every public key has a fingerprint (6 emoji + an 8-hex code, e.g. `🤩 🥑 🛸 🐰 🤔 ⚽  08FE-D363`). You confirm it out-of-band (read it aloud, compare in another channel) before trusting a key.

## The crypto, named

Zero-dependency [WebCrypto](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API) only - no custom primitives, no third-party crypto library. Auditable and proven by [`poc/verify.mjs`](../poc/verify.mjs).

| Purpose | Primitive |
|---|---|
| Identity keypair | ECDH **P-256** (extractable, so you can back it up) |
| Key agreement (sealed-box) | ECDH `deriveBits`, fresh ephemeral keypair per share |
| Key derivation | **HKDF-SHA256** (distinct `info` per use) |
| Content & key-wrap encryption | **AES-256-GCM**, fresh 96-bit IV, 128-bit tag |
| Fingerprint | **SHA-256** over the raw public key |

Envelope: `ECDH-P256+HKDF-SHA256+AES-256-GCM`, version `1`. See [§ Wire format](#wire-format-stability) below.

## What claudepad defends against

- **A curious or compromised host reading your session or its secrets.** There is no host in the data path. The blob you hand someone contains only ciphertext plus your *public* card - no plaintext transcript, no secret values. ([`poc/verify.mjs`](../poc/verify.mjs) test "no plaintext in blob".)
- **A non-recipient who gets the blob.** Without the recipient's private key, the derived wrapping key is different and decryption fails. They get nothing. (test "non-recipient lockout".)
- **A network observer.** Nothing is uploaded, so there is nothing on the wire to observe. You can verify this yourself - see [`verify-zero-knowledge.md`](./verify-zero-knowledge.md).
- **A low-privilege recipient trying to read secrets.** Body-only blobs omit the secret ciphertext entirely; the secret key is never wrapped to them. (test "tiered decrypt".)
- **A forged sender name.** Anyone can mint an identity named "Anthropic". The fingerprint - shown when you decrypt - is what you verify; a swapped key produces a different fingerprint.
- **A swapped recipient key (MITM before encryption).** The pre-encryption fingerprint check catches a key that doesn't match what your recipient told you.
- **Accidental publication of `.env`/token values.** The mandatory, load-bearing review-before-share step surfaces every detected secret so you decide what leaves your machine.

## What claudepad does NOT defend against (by design, v1)

We give these up consciously in exchange for "no server, nothing to trust." Each returns only if an **optional, opt-in store addon** ships in a later version (see [`ROADMAP.md`](./ROADMAP.md) §6).

- **Availability.** With no host, a blob can be lost if you don't keep it. It is your artifact to store. (Optional pinning = vNext.)
- **Revocation / expiry / burn-after-read.** Once a blob is shared and decrypted, it cannot be recalled. There is no TTL. (Needs a server = vNext.)
- **Discovery / inbox.** There is no "everything shared with me" view. Sharing is point-to-point: you hand someone a blob. (Needs an index/relay = vNext.)
- **Sender authentication beyond a fingerprint.** The sealed-box construction is anonymous-sender; the name and fingerprint travel with the blob but are **not** signed. A matching fingerprint tells you the key is the one you verified, not that this particular blob was authored by its holder. Optional detached signatures = vNext.
- **A recipient who leaks onward.** Once someone can legitimately read a session, nothing stops them re-sharing it. This is a social-trust problem, not a crypto one.
- **Endpoint compromise.** Malware, a keylogger, or a malicious browser extension on the sharer's or recipient's machine can read an unlocked key or the plaintext. claudepad cannot defend a compromised endpoint.
- **A determined MITM on your verification channel.** Fingerprints are "good for friends," in the Signal safety-number sense - not a defense against an attacker who controls the channel you use to compare fingerprints *and* swaps the key.

### Best-effort redaction (read this)

Secret detection is **best-effort, never complete.** It combines known token prefixes (`sk-`, `ghp_`, `AKIA…`, JWT shapes, PEM blocks, …), Shannon-entropy heuristics, and any `.env`/`.dev.vars` values you supply for exact matching.

- A **missed** secret stays in plaintext inside the body layer. It is still protected from non-recipients, but it is visible to **every tier you grant the body to**, including low-privilege.
- This is exactly why the **review-before-share step is mandatory**: you see all detections, can add/remove/edit them, and confirm before any blob is produced. claudepad never auto-publishes.

### Metadata

Because v1 uploads nothing, there is no server-side metadata leak (size, timing, access counts, IP). If you carry a blob over a third-party channel (Slack, email), **that channel** sees the blob's size, timing, and your transport metadata - claudepad cannot change what your messenger logs.

## Identity, loss, and device protection

- Your identity lives in browser storage (IndexedDB). **Clearing it without a backup loses it** - there is no server to recover it. Export your identity secret (`cp-id-…`) and keep it safe; that is the recovery path.
- Optionally lock your identity behind your **device's passkey** via the WebAuthn PRF extension (pattern A): the private key is stored encrypted under a key only your authenticator can re-derive, so it is locked at rest until you unlock it. This needs a real origin (works on `localhost`, your self-host, or `claudepad.io`; **not** `file://`). PRF support varies by browser/authenticator; the exported secret is always the fallback.

## Web hygiene is part of the model

An unlocked private key lives in JavaScript memory. claudepad's defenses against script-based theft are structural: a **single static bundle, no third-party scripts, self-hosted fonts, no CDNs**, and a strict content-security posture. Pattern-A device protection keeps the key *encrypted at rest* and exposes it only while unlocked.

<a name="wire-format-stability"></a>
## Wire format stability

The blob/identity envelope is versioned independently of the product version. v1 ships:

- Blob envelope: `v: 1`, `alg: "ECDH-P256+HKDF-SHA256+AES-256-GCM"`.
- Identity card / secret: `v: 1`.

A reader rejects unknown versions or algorithms rather than guessing (`CryptoVersionError`). Format changes will bump these and be documented so a blob made today stays openable.

## The honest bottom line

claudepad is a **client-side tool that makes one encrypted artifact for one recipient, and gets out of the way.** It is not E2E messaging, not a key directory or PKI, not a backup service. It is good for sharing a session with someone you can verify out-of-band; it is not a defense against a nation-state, a compromised endpoint, or a recipient who chooses to leak. Those limits are stated here, in the README, and in the app - never buried.

## Pre-v1.0 gate

Per [`SECURITY-MODEL.md`](./SECURITY-MODEL.md), an **independent security review** of the crypto core and secret handling is a hard gate on the v1.0 tag, alongside this published threat model. See [`SECURITY.md`](../SECURITY.md) for how to report issues.
