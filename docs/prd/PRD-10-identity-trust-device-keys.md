# PRD-10 - Identity, Trust & Device Keys

> **Phase:** P2 (Identity & Trust) · **Status:** Draft · **New in the serverless-v1 pivot**
> **Canonical refs:** `../TRUSTLESS-MODEL.md` (§2 identity, §5 fingerprints, §6 device keys - conform exactly), `_context.md` §3/§5, §7 (template). **Reference implementation:** `poc/` (identity, fingerprints, WebAuthn-PRF all working).

---

## 1. Summary & problem

To share trustlessly (PRD-11), a user needs a cryptographic **identity** and a way to know that a public key really belongs to who it claims. This PRD owns the identity lifecycle - **mint, import/export, store, display, and optionally lock behind a device passkey** - and the **fingerprint** mechanism that makes a self-claimed name verifiable. It is entirely client-side: no accounts, no server. The crypto is already proven in `poc/`; this PRD specifies the productized version.

## 2. Goals / Non-goals

### Goals
- **G1.** Mint a client-side **ECDH P-256** identity with a self-claimed display name (DECISIONS D-22).
- **G2.** Produce two shareable artifacts: a **public key card** (`cp-pub-…`, safe to post) and an **identity secret** (`cp-id-…`, the backup).
- **G3.** Persist the identity locally (IndexedDB), export/import for backup and device migration.
- **G4.** Show a **fingerprint** (SHA-256 over the public key → emoji + hex) wherever trust is established (D-25).
- **G5.** Optional **device protection** via WebAuthn PRF (pattern A default; pattern B documented) - no server (D-26).
- **G6.** Three identity states - **none / locked / unlocked** - with clear transitions.
- **G7.** Honest UX about loss, backup, and the limits of name-trust.

### Non-goals
- **NG1.** The share/receive flow and recipient wrapping - **PRD-11**.
- **NG2.** The AES-GCM / ECDH / HKDF primitives themselves - **PRD-05** (this PRD consumes them).
- **NG3.** Any server, key directory, or PKI. Names are self-claimed; there is no registry (vNext: social proofs).
- **NG4.** Group identities / org accounts (vNext).
- **NG5.** Sender signatures (PRD-11 / vNext).

## 3. Personas & user stories

- **Sharer:** *As Toby, I want to mint an identity with my name so I can share sessions and receive them back.*
- **Recipient:** *As Steve, I want to give Toby my public key so he can encrypt a session only I can read.*
- **Verifier:** *As Steve, I want to confirm the key Toby used is really mine (and the sender of a blob is really Toby) by comparing a short fingerprint out of band.*
- **Security-conscious user:** *As a user on a shared laptop, I want my identity locked behind Touch ID so a private key isn't sitting unprotected in browser storage.*
- **Multi-device user:** *As someone with a phone and a laptop, I'd like my identity to follow me without uploading it anywhere.*

## 4. UX & flows

### 4.1 Three states
```
        ┌─────────────────────────────────────────────────────────┐
        │  NONE  ──mint / import──▶  UNLOCKED  ──protect (passkey)─▶│
        │                              ▲   │        (now protected) │
        │                              │   │                        │
        │              unlock (passkey)│   │sign out / reload        │
        │                              │   ▼                         │
        │                            LOCKED  ◀────────────────────── │
        └─────────────────────────────────────────────────────────┘
  NONE      → "mint" (name) or "import" (paste cp-id-…)
  UNLOCKED  → identity in memory; can share, export, protect, sign out
  LOCKED    → protected identity at rest; "Unlock with device" to use it
```

### 4.2 Identity panel (unlocked)
```
┌─ Your identity ─────────────────────────────────────────────┐
│  ● Signed in as Toby                            [ Sign out ] │
│                                                              │
│  Your public key (give to friends - safe to post):          │
│   cp-pub-eyJ2IjoxLCJuYW1lIjoiVG9ieSIsInB1Yi…   [Copy]        │
│  Your fingerprint (read aloud to verify):                   │
│   🥕 🥑 🙃 🍎 😂 🎹   4A2B-6D99                              │
│                                                              │
│  [ Download identity secret (back this up!) ]               │
│  ⚠ This is your only key. No server can recover it.         │
│                                                              │
│  🔐 Device protection                                        │
│   [ Protect with this device ]   (passkey / Touch ID)       │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Locked state
```
┌─ Your identity ─────────────────────────────────────────────┐
│  🔒 Identity "Toby" is locked by your device                 │
│  Unlock with your fingerprint / Face ID / security key.     │
│  [ 🔓 Unlock with device ]   [ Forget on this browser ]      │
└──────────────────────────────────────────────────────────────┘
```

## 5. Functional requirements

Numbered, testable. **MUST** unless noted.

### Mint / import / export
- **FR-1.** "Mint" MUST generate an extractable **ECDH P-256** keypair via `crypto.subtle.generateKey` and capture a user-supplied **display name** (default `anon` if blank).
- **FR-2.** The **public key card** MUST serialize as `cp-pub-` + base64url(`JSON{ v, name, pub }`) where `pub` is the raw exported public key (base64url). It MUST be safe to share publicly (contains no private material).
- **FR-3.** The **identity secret** MUST serialize as `cp-id-` + base64url(`JSON{ v, name, pub, priv }`) where `priv` is the private key JWK. "Download identity secret" MUST export it as a file; "Copy" MUST be available.
- **FR-4.** "Import / Sign in" MUST accept a `cp-id-…` string, validate it (has `priv`, parses, key imports), and adopt it as the current identity, or show a clear error.
- **FR-5.** Display names are **self-claimed labels with no authority** (FR-12). The UI MUST never present a name as verified identity.

### Storage & states
- **FR-6.** The identity MUST persist across reloads in **IndexedDB** (PoC uses `localStorage`; production uses IndexedDB for size/robustness).
- **FR-7.** The app MUST implement three states (none / locked / unlocked) per §4.1, rendering the correct panel and never exposing the private key in the locked state.
- **FR-8.** "Sign out" MUST: for an unprotected identity, optionally remove it (with an export reminder); for a **protected** identity, **just re-lock** it (do not delete).
- **FR-9.** "Forget on this browser" MUST remove the stored identity, with a clear warning that recovery requires the exported secret (or a synced passkey, pattern B).

### Fingerprints (trust)
- **FR-10.** A fingerprint MUST be computed as `SHA-256(rawPublicKeyBytes)` rendered as **6 emoji (from a fixed 64-entry palette, indexed by `byte & 63`) + an 8-hex code** (next 4 bytes, `XXXX-XXXX`). It MUST be deterministic for a given key and differ for different keys (`poc/verify.mjs` [5]).
- **FR-11.** The fingerprint MUST be displayed in **three** places: your own identity (with "read aloud to verify"); when a recipient public key is pasted in the share flow (PRD-11) - "confirm it matches"; and when a blob is decrypted - the **sender's** fingerprint (PRD-11).
- **FR-12.** The hex code MUST always be shown alongside the emoji (accessibility for color/emoji-blind users; Q-17). The UI MUST state that the name is self-claimed and trust requires fingerprint confirmation.

### Device protection (WebAuthn PRF - no server)
- **FR-13.** When `window.PublicKeyCredential` is present **and** the origin is not `file://`, the app MUST offer "Protect with this device." Otherwise it MUST show a clear "needs a real origin / unsupported" note (degrade gracefully).
- **FR-14.** "Protect" (pattern A) MUST: create a passkey with the **PRF extension evaluated at registration** (`extensions.prf.eval.first = salt`) to obtain the PRF output in one ceremony; derive **KEK = HKDF-SHA256(PRF output)**; AES-256-GCM-encrypt the identity secret under the KEK; store `{ protected:true, name, pub, credentialId, wrapped }`. It MUST fall back to a single `get()` only when the authenticator can't return PRF at creation. (Avoids the double prompt - proven in `poc/`.)
- **FR-15.** "Unlock with device" MUST `get()` with `prf.eval` for the stored `credentialId`, re-derive the KEK, decrypt the identity into memory, and transition to unlocked. A wrong/absent device MUST fail closed with a clear message and never partially reveal the key.
- **FR-16.** The wrapped identity at rest MUST NOT contain the private scalar in any readable form (`poc/verify.mjs` [6] asserts this). A different PRF secret MUST NOT unwrap it.
- **FR-17.** "Remove device protection" MUST require the identity to be unlocked, then re-store it unprotected (with confirmation).
- **FR-18.** The **exported identity secret remains the recovery fallback** regardless of device protection; the UI MUST encourage exporting before enabling protection.
- **FR-19 (pattern B, opt-in).** The app MAY offer a "roam to my devices" mode that derives the keypair deterministically from PRF output (needs `@noble/curves`); when the passkey syncs, the identity is reproduced on other devices with no server. This MUST be clearly labeled as relying on PRF + passkey sync support.

### Robustness & hygiene
- **FR-20.** Private keys MUST live in memory only while unlocked; never logged, never sent anywhere (there is no network for them). Unlocked-key exposure window is documented (XSS hygiene: CSP, no third-party scripts).
- **FR-21.** All identity entry points MUST validate inputs and throw typed errors; corrupt `cp-id-`/`cp-pub-` strings MUST produce friendly errors, not crashes.

## 6. Technical design

### 6.1 Modules
```
packages/client/src/identity/
  identity.ts     // mint, import/export (cp-id / cp-pub), card/secret serialize
  fingerprint.ts  // SHA-256 → emoji+hex (pure)
  store.ts        // IndexedDB persistence; 3-state machine
  device.ts       // WebAuthn PRF: createPasskey(eval), prfOutput, deriveKEK, wrap/unwrap
```
The crypto primitives (`generateKey`, `deriveBits`, HKDF, AES-GCM) come from **PRD-05**'s core; this PRD orchestrates them. All functions mirror the verified `poc/` implementation.

### 6.2 Identity serialization
- `cp-pub-` = `'cp-pub-' + b64url(utf8(JSON{ v:1, name, pub }))`, `pub` = base64url(`exportKey('raw', publicKey)`), 65-byte P-256 point.
- `cp-id-`  = `'cp-id-' + b64url(utf8(JSON{ v:1, name, pub, priv }))`, `priv` = `exportKey('jwk', privateKey)`.
- Imports validate `v`, that `priv` imports as a P-256 ECDH key, and that `pub` matches.

### 6.3 Fingerprint (verified)
```
fp(pub) = SHA-256(rawPub) ⇒ bytes[0..5] → emoji[b & 63]   (palette of 64)
                            bytes[6..9] → hex "XXXX-XXXX"
```
Palette and code length are locked in this PRD (Q-17). Emoji chosen for visual distinctness; hex is the accessible fallback.

### 6.4 Device protection (pattern A, the default)
```
protect:  create()[prf.eval=salt] → prfOut (or fallback get())
          KEK = HKDF(prfOut, info="claudepad-kek-v1")
          wrapped = AES-GCM(KEK, identitySecret)
          store { protected, name, pub, credentialId, wrapped }
unlock:   get()[prf.eval=salt, allow=credentialId] → prfOut
          KEK = HKDF(prfOut) → identity = AES-GCM-decrypt(KEK, wrapped)
```
`salt` is a fixed app constant (`SHA-256("claudepad-prf-salt-v1")`). WebAuthn needs a real origin → works on `localhost`/self-host/`claudepad.io`, not `file://`. Pattern B (seed) is the same PRF output fed through `@noble`'s `p256.getPublicKey(scalar)` instead of wrapping a stored key.

### 6.5 Trade-offs
- **P-256 vs X25519:** P-256 for zero-dep WebCrypto (pattern A). X25519 only if pattern B ships (needs noble anyway).
- **IndexedDB vs localStorage:** IndexedDB for production (larger, structured); PoC used localStorage for brevity.
- **Fingerprint emoji+hex vs numeric safety number:** emoji is faster to compare verbally; hex guarantees accessibility and exactness.

## 7. Data model

```ts
type IdentitySecret = { v: 1; name: string; pub: string /*b64url raw*/; priv: JsonWebKey };
type PublicCard     = { v: 1; name: string; pub: string };
type StoredIdentity =
  | { protected: false; /* = IdentitySecret */ v:1; name:string; pub:string; priv:JsonWebKey }
  | { protected: true; name: string; pub: string; credentialId: string /*b64url*/;
      wrapped: { iv: string; ct: string } };
type Fingerprint = { emoji: string; code: string /* "XXXX-XXXX" */ };
```

## 8. Security & privacy

Conforms to `TRUSTLESS-MODEL.md` §2/§5/§6 and `_context.md` §5:
- **No server, no account** - identity is local; nothing is registered anywhere (FR-1…FR-9).
- **Name ≠ identity** - self-claimed; fingerprints provide verifiable trust (FR-10…FR-12). Honest "good for friends" framing.
- **Device protection is client-only** - WebAuthn used purely as a local PRF oracle; no attestation leaves the device (FR-13…FR-16).
- **Key at rest** - encrypted under the device KEK when protected (FR-16); exported secret is the user's responsibility (FR-18).
- **Risks:** identity loss on storage clear (mitigated by export + pattern-B sync); unlocked key in JS memory (XSS hygiene); PRF support variance (graceful fallback). All documented, not buried.

## 9. Dependencies

**Upstream:** PRD-05 (AES-GCM/ECDH/HKDF/SHA-256 primitives), PRD-01 (design system for the panels).
**Downstream:** PRD-11 (consumes the identity to encrypt to recipients and to show sender/recipient fingerprints), PRD-04 (share entry points), PRD-09 (security review covers this).

## 10. Acceptance criteria / DoD

- [ ] Mint → public card + identity secret + fingerprint render; import round-trips (FR-1…FR-4).
- [ ] Three states behave per §4.1; locked state never exposes the private key (FR-7).
- [ ] Fingerprint stable per key, distinct across keys, shown in all three places, hex always present (FR-10…FR-12; mirrors `poc/verify.mjs` [5]).
- [ ] Protect with device → reload shows locked → unlock restores identity; single registration prompt where PRF-at-create is supported (FR-13…FR-15).
- [ ] Wrapped identity contains no private scalar; wrong device cannot unwrap (FR-16; `poc/verify.mjs` [6]).
- [ ] Remove protection reverts to unprotected storage (FR-17); export works in all states where unlocked (FR-18).
- [ ] Unsupported origin (`file://`) / no-PRF authenticator degrades with a clear message (FR-13).
- [ ] No private key value reaches logs or any network call (FR-20).

## 11. Open questions

- **Q-15 (pattern A vs B default):** A as default; B as opt-in "roam to my devices." Confirm whether B ships in v1 or vNext (it adds `@noble`).
- **Q-17 (fingerprint encoding):** lock the 64-emoji palette and confirm accessibility (hex always shown). Consider a word-list option.
- **New OQ-A:** multiple identities per browser (personas) in v1, or single-identity for simplicity? Lean single in v1.
- **New OQ-B:** should "Protect with device" *require* a prior export (force the backup) before enabling? Lean yes (footgun guard).
- **New OQ-C:** recipient address book - store known contacts' public cards + local aliases locally? Useful for PRD-11; lean minimal in v1 (paste each time), address book as a fast follow.

## 12. Phase / milestone

**Phase P2 - Identity & Trust.** Build order: after the crypto core (PRD-05) and the offline prettifier (PRD-01–04), before trustless sharing (PRD-11). Gating for v1: covered by the independent security review (PRD-09).
