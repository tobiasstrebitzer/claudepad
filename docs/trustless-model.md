# claudepad - Trustless & Identity Model

> The canonical design for claudepad's **serverless, client-side** sharing. This is the spine of v1. It is **proven by the crypto conformance suite** (`packages/crypto/test/conformance.test.ts`), which runs the full trustless-share narrative end-to-end against the production crypto. `security-model.md` holds the threat-model framing it conforms to.

## 0. One paragraph

There is no server. You mint an **identity** (an ECDH keypair) in your browser. To share a session you encrypt it **to a recipient's public key**, producing a self-contained **blob** you carry anywhere (clipboard/file). Only the holder of the matching private key can decrypt it. Secrets get a **second key** so you can grant a recipient the transcript only, or the transcript *and* its secrets. Keys are verified out-of-band by **fingerprint**. Your identity can be locked behind your **device's passkey** (WebAuthn PRF) - still no server.

## 1. Goals

1. The host can't read a share - because **there is no host** in the data path.
2. A sharer cryptographically controls, per recipient, whether secrets are revealed.
3. Identity is self-sovereign: minted locally, portable, no account.
4. Trust in a public key is **verifiable** (fingerprint), not assumed from a self-claimed name.
5. Everything runs in a static page; zero-dependency WebCrypto core.

## 2. Identity

- An **ECDH P-256 keypair**, generated with `crypto.subtle.generateKey` (extractable, so it can be backed up). *Why P-256 and not X25519:* universal WebCrypto support with zero dependencies; X25519 needs a JS lib (documented as the alt; required for pattern-B portability, §6).
- A self-claimed **display name** (e.g. "Toby") travels with the key purely as a label. **It asserts nothing** - anyone can mint `name: "Anthropic"`. Trust comes from the fingerprint (§5), and recipients may assign their own local alias.
- **Two shareable artifacts:**
  - **Public key card** (`cp-pub-…`) = `base64url(JSON{ v, name, pub })` - safe to post publicly; this is what a friend pastes to share *with you*.
  - **Identity secret** (`cp-id-…`) = `base64url(JSON{ v, name, pub, priv(JWK) })` - your private key; back it up, never share it.
- **Storage:** in `localStorage` (PoC) / IndexedDB (production). Exportable for backup. Clearing storage without a backup = identity lost (no server to recover it) - mitigated by export and by pattern-B synced passkeys (§6).

## 3. Encrypting to a recipient (the share)

Hybrid encryption ("encrypt to recipient," `age`/sealed-box style). Per share:

```
1. content keys (independent, random AES-256-GCM):
     K_body    encrypts the redacted transcript
     K_secret  encrypts the secret map        (only if secrets exist)
2. ephemeral ECDH keypair E   (fresh per share → unlinkable, forward-secret wrap)
3. KW = HKDF-SHA256( ECDH(E_priv, Recipient_pub) )           // wrapping key
4. wrap = AES-GCM(KW, JSON{ kb: K_body, ks?: K_secret })     // ks only for high tier
5. blob = { v, alg, eph: E_pub, from:{name,pub}, tier,
            wrap, body: AES-GCM(K_body, transcript),
            secret: AES-GCM(K_secret, secretMap) | null }
```

The recipient computes the **same** `KW = HKDF(ECDH(Recipient_priv, E_pub))` (ECDH is symmetric), unwraps the content keys, and decrypts. A non-recipient derives a different `KW`, so AES-GCM auth fails - they get nothing (`packages/crypto/test/conformance.test.ts` test [3]).

### Per-recipient tiering
The tier is *which keys you wrap*: **body-only** wraps `kb` (and omits the secret ciphertext entirely); **body+secrets** wraps `kb` and `ks`. Same content design as the original two-key envelope (DECISIONS D-13/D-23), now delivered by wrapping instead of by handing out two URLs. Different recipients can get different tiers of the same session - just build a blob per (recipient, tier).

### The blob is the message
The serialized blob (`cp-blob-…`) contains **no plaintext** transcript or secret - only ciphertext plus the sender's *public* card (test [4]). It's dropped anywhere: a public Slack channel, an email, a `.cpad` file. Inert to everyone except the recipient.

## 4. Crypto primitives (v1, zero-dependency WebCrypto)

| Purpose | Primitive |
|---|---|
| Identity keypair | ECDH **P-256** (`generateKey`, extractable) |
| Key agreement | ECDH `deriveBits` (256-bit shared secret) |
| Key derivation | **HKDF-SHA256** (distinct `info` per use: `claudepad-…-v1`) |
| Content & wrap encryption | **AES-256-GCM**, fresh 96-bit IV per op, 128-bit tag |
| Fingerprint | **SHA-256** over the raw public key |

No custom primitives, no `crypto-js`. (`@noble/curves` enters only for pattern-B deterministic identity, §6.)

## 5. Trust: key fingerprints

A self-claimed name is not identity. Each public key has a **fingerprint** = `SHA-256(rawPublicKey)` rendered as **6 emoji + an 8-hex code** (e.g. `🤩 🥑 🛸 🐰 🤔 ⚽  08FE-D363`). It is shown in the three moments trust is established:

- **Your identity** - read it aloud so a friend confirms the key they received is yours.
- **Pasting a recipient key** - confirm it matches what they told you (catches a swapped/MITM key *before* you encrypt).
- **Decrypting a blob** - the sender's fingerprint, "trust only if it matches theirs" (catches a forged sender name).

This is the Signal "safety number" pattern. Honest framing: it's **good for friends**, not a defense against a determined MITM on your verification channel. The hex code is always shown alongside the emoji for accessibility (color/emoji-blind users). Accessibility & final palette: Q-17.

## 6. Device protection (WebAuthn PRF - no server)

WebAuthn credentials *sign*; they don't decrypt. The **PRF extension** (`hmac-secret`) turns a passkey/security key into a deterministic secret oracle: give it a salt, the user verifies (biometric/PIN), and you get back 32 stable, hardware-gated bytes - entirely client-side, **no relying-party server, no attestation sent anywhere**. Two patterns:

- **Pattern A - PRF as KEK (v1 default).** Mint the ECDH identity normally; store the private key **encrypted under a KEK = HKDF(PRF output)**. On reload the identity is *locked* until a passkey unlock re-derives the KEK and decrypts it. Zero-dependency; device-bound. Proven (wrapping layer) in `packages/crypto/test/conformance.test.ts`; live in `apps/client`. To avoid a double prompt, **PRF is evaluated during registration** (`create()` with `prf.eval`), falling back to one `get()` only on authenticators that can't eval-at-create.
- **Pattern B - PRF as seed (opt-in, multi-device).** Derive the keypair deterministically from the PRF output. Nothing secret is stored locally; if the passkey **syncs** (iCloud Keychain / Google Password Manager), the identity roams to your other devices with no server. Cost: deterministic P-256 keygen from a scalar needs `@noble/curves` (WebCrypto can't seed `generateKey`).

**Constraints (honest):** WebAuthn needs a real origin - it does **not** run from `file://` (works on `localhost`, self-host, `claudepad.io`). PRF support varies by browser/authenticator; the exported identity secret (§2) is always the recovery fallback. Pattern choice: Q-15.

## 7. Threat model & the trade-offs we accept

**Defended:**
- A non-recipient reading a shared session or its secrets - cryptographically impossible (AES-GCM under a key they don't hold).
- A network observer - there's nothing to observe; nothing is uploaded.
- A forged sender name - caught by the fingerprint check.
- A swapped recipient key - caught by the pre-encryption fingerprint check.

**Out of scope (v1, by design - D-29):**
- **Availability.** No host means a blob can be lost if the user doesn't keep it. It's their artifact. (Optional pinning = vNext.)
- **Revocation / expiry / burn.** Once a blob is shared and decrypted, it can't be recalled. No TTL. (Needs a server = vNext.)
- **Discovery / inbox.** No "everything shared with me" - sharing is point-to-point (you hand someone a blob). (Needs an index/relay = vNext.)
- **Sender authentication.** Sealed-box is anonymous-sender; the embedded name/fingerprint are *informational*, unverified by signature. Optional detached signatures = vNext (Q-18).
- **A recipient leaking onward**, endpoint compromise (malware/XSS exfiltrating an unlocked key), and a determined MITM on the fingerprint channel.

**XSS note:** an unlocked private key lives in JS memory; standard web hygiene (CSP, no third-party scripts, single static bundle, no font/script CDNs) is part of the design. Pattern-A keeps the key *encrypted at rest*; it's exposed only while unlocked.

## 8. What this is not (anti-goals)

Not E2E *messaging* (no transport, no delivery, no groups, no ratchet). Not a key directory or PKI. Not a backup service. It is a **client-side tool that makes one encrypted artifact for one recipient**, and gets out of the way.

## 9. Reference implementation

The production code is the implementation; its conformance test is the executable spec:
- `packages/crypto` - the zero-dependency WebCrypto core: identity (mint/import/export), public-key + fingerprint, encrypt-to-recipient with tier, blob output, receive/decrypt, and WebAuthn-PRF device-key wrapping. The live app (`apps/client`) drives it end-to-end.
- `packages/crypto/test/conformance.test.ts` - the headless conformance suite running the full trustless-share narrative against the production crypto: tiered decrypt, non-recipient lockout, no-plaintext-in-blob, fingerprint stability/distinctness, and the device-key wrap/unwrap. Production code must keep these green.
