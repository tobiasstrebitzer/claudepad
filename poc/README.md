# claudepad PoC — trustless, serverless share

Proves the core idea from the brainstorm: **identity + encrypt-to-recipient + per-recipient tiering, entirely client-side, no server.**

## Files
- **`trustless-share.html`** — mint an identity, share a session encrypted to a recipient's public key at a chosen tier (body / body+secrets), decrypt as the recipient, verify keys by fingerprint, and optionally lock your identity behind a device passkey. The blob is inert text to everyone else.
- **`verify.mjs`** — headless verification of the exact same crypto (16 checks). `node poc/verify.mjs`.

## Running it
- **Basic features** (identity, share, decrypt, fingerprints) work from `file://` — just open the HTML.
- **Device protection (passkeys)** needs a real origin — WebAuthn won't run from `file://`. Serve over localhost:
  ```sh
  cd poc && python3 -m http.server 8782
  # then open http://localhost:8782/trustless-share.html
  ```
  Use `http://localhost` (not `127.0.0.1` — WebAuthn rpId rules). A platform passkey (Touch ID / Windows Hello / Android) or a PRF-capable security key is required.

## Try it (two-browser test)
1. Open `trustless-share.html` in **Browser A** → mint identity "Steve" → copy his **public key**.
2. Open it in **Browser B** (or a private window) → mint "Toby" → in *Share*, paste Steve's public key, pick **Body + Secrets**, click **Encrypt** (blob auto-copies).
3. Send the blob to Browser A (any channel). In *Receive*, paste it → Steve reads body **and** secrets.
4. Re-share as **Body only** → Steve sees the body but the secrets layer is withheld.
5. Mint a third identity "Eve" anywhere and paste either blob → **decryption fails** (she's not the recipient).

## Crypto
ECDH P-256 → HKDF-SHA256 → AES-256-GCM (WebCrypto, zero dependencies). Each share uses an ephemeral keypair (sealed-box style); two independent content keys (`K_body`, `K_secret`) are wrapped to the recipient — high tier includes both, low tier only `K_body`.

## Device protection (WebAuthn PRF — pattern A)
"Protect with this device" encrypts your stored identity with a key derived from your passkey/security key via the **WebAuthn PRF extension**, entirely client-side (no server). On reload the identity is **locked** until you unlock with biometrics/PIN/security key. If your passkey syncs (iCloud Keychain / Google Password Manager), the identity can roam to your other devices. Caveats: PRF support varies by browser/authenticator; the exported identity secret remains the backup of last resort. WebAuthn here is used purely as a local key-derivation oracle — no attestation is sent anywhere.

## What this PoC deliberately omits (the trustless trade-offs)
Durable availability/pinning · an inbox to discover what's shared with you · expiry / burn / revoke (impossible once a blob is public & immutable). Sender name is **self-claimed** — now verifiable via the displayed fingerprint, but real-world trust still benefits from social proofs. See `docs/DECISIONS.md` open questions.
