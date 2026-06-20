# PRD-11 - Trustless Recipient Sharing

> **Phase:** P3 (Trustless Sharing - the moat) · **Status:** Draft · **New in the serverless-v1 pivot**
> **Canonical refs:** `../TRUSTLESS-MODEL.md` (§3 the share, §5 fingerprints, §7 threat model - conform exactly), `_context.md` §5, §7 (template). **Reference implementation:** `poc/` (the entire flow works; `poc/verify.mjs` = 16-check anchor).

---

## 1. Summary & problem

This is the product's headline: encrypt a Claude Code session **to a specific recipient** and hand them an inert blob they can read and no one else can - **with no server**. It ties together PRD-02 (the session), PRD-06 (redaction + secret map), PRD-05 (crypto), and PRD-10 (identities). The sharer picks a recipient by public key and a **tier** (body / body+secrets); the output is a `cp-blob-…` carried via clipboard or `.cpad` file ("drop it anywhere"). The recipient pastes it and decrypts at their granted tier. The model is proven end-to-end in `poc/`.

## 2. Goals / Non-goals

### Goals
- **G1.** Encrypt a (redacted) session to one recipient's public key using the PRD-05 ephemeral-sealed-box wrap (`TRUSTLESS-MODEL.md` §3).
- **G2.** Support **per-recipient tiering**: body-only (wrap `K_body`) vs body+secrets (wrap `K_body` + `K_secret`) (D-23).
- **G3.** Output a self-contained **blob** (`cp-blob-…`): auto-copy to clipboard and/or download `.cpad`. No upload, no link.
- **G4.** **Receive/decrypt** flow: paste a blob → decrypt at the recipient's tier → hand the session to the viewer (PRD-03).
- **G5.** **Fingerprint verification** at both ends: confirm the recipient key before encrypting; show the sender's fingerprint after decrypting (PRD-10 FR-11).
- **G6.** Honest UX about what trustless gives up (no recall/expiry/availability) and the unverified sender name.
- **G7.** Define the **blob format** (versioned) and keep `poc/verify.mjs` green against the production implementation.

### Non-goals
- **NG1.** The crypto primitives and wrap mechanics - **PRD-05** (this PRD orchestrates them).
- **NG2.** Identity mint/store/device-keys - **PRD-10**.
- **NG3.** Secret detection and the redaction review UI - **PRD-06** (this PRD consumes `{ redactedSession, secretMap }`).
- **NG4.** Any server, hosted URL, expiry/burn, inbox, or pinning - vNext (D-29).
- **NG5.** Sender signatures / verified-sender (sealed-box is anonymous-sender; optional signatures = vNext, Q-18).
- **NG6.** Multi-recipient *group* semantics with forward secrecy (vNext); v1 multi-recipient is "wrap to each" (Q-14).

## 3. Personas & user stories

- **Sharer:** *As Toby, I want to send Steve a session so only Steve can read it, by pasting Steve's public key and copying a blob into Slack.*
- **Sharer (tiered):** *As Toby, I want to give Steve the transcript and secrets, but give the wider team body-only - different blobs, guaranteed by crypto.*
- **Recipient:** *As Steve, I paste the blob and read it; if I wasn't granted secrets, I see redaction placeholders.*
- **Recipient (verifier):** *As Steve, I check the sender's fingerprint matches Toby's before trusting the content.*
- **Outsider:** *As Eve, I find the blob in a public channel and it's useless to me.*

## 4. UX & flows

### 4.1 Share flow
```
Local session (PRD-02/03)
      │
      ▼
[PRD-06] Review-before-share → { redactedSession, secretMap }   (mandatory)
      │
      ▼
Share dialog (this PRD):
 ┌────────────────────────────────────────────────────────┐
 │  Share with…                                            │
 │  Recipient public key:  [ cp-pub-…              ] [paste]│
 │   → for Steve   🤩 🥑 🛸 🐰 🤔 ⚽  08FE-D363             │
 │     (confirm this matches what Steve told you)          │
 │                                                         │
 │  Grant:  (•) Body only   ( ) Body + Secrets (3)         │
 │                                                         │
 │              [ Cancel ]        [ Encrypt for Steve ]    │
 └────────────────────────────────────────────────────────┘
      │  Encrypt
      ▼
[PRD-05] wrap content keys to recipient → assemble blob
      │
      ▼
 ┌────────────────────────────────────────────────────────┐
 │  Encrypted for Steve ✓  (copied to clipboard)           │
 │  cp-blob-eyJ2IjoxLCJ…                       [Copy] [↓]   │
 │  Drop it anywhere - only Steve can read it.             │
 │  ⚠ No server holds this. If it's lost, it's gone.       │
 └────────────────────────────────────────────────────────┘
```

### 4.2 Receive flow
```
Paste cp-blob-… → [Decrypt]
   ├─ not signed in / wrong identity → "🔒 This blob isn't addressed to you"
   ├─ body-only grant → render transcript with [SECRET ••••] placeholders
   └─ body+secrets    → render transcript with secrets substituted
   + show sender:  "claims to be from Toby - trust only if this matches:
                    🥕 🥑 🙃 🍎 😂 🎹  4A2B-6D99"
```

### 4.3 Large sessions
Above a size threshold the dialog steers to **`.cpad` file** download/upload instead of clipboard (Q-16); small ones default to clipboard with auto-copy.

## 5. Functional requirements

### Share
- **FR-1.** The share action MUST require an unlocked identity (PRD-10) and a valid recipient **public key card** (`cp-pub-…`); invalid input MUST produce a friendly error.
- **FR-2.** On paste of a recipient key, the UI MUST display the recipient's **name + fingerprint** and prompt the user to confirm it out of band before encrypting (PRD-10 FR-11).
- **FR-3.** The share dialog MUST offer a **tier** choice - *Body only* / *Body + Secrets* - and MUST disable/hide the secrets tier when the session has no detected secrets (from PRD-06).
- **FR-4.** Encryption MUST use PRD-05's `createBlob`: independent `K_body`/`K_secret`, an **ephemeral ECDH keypair per share**, `KW = HKDF(ECDH(eph, recipientPub))`, wrap `{ kb, ks? }` under `KW`; include the `secret` ciphertext **only** at the body+secrets tier (D-23, D-24).
- **FR-5.** The produced **blob** MUST conform to §7's versioned format, contain **no plaintext** transcript or secret value (only the sender's *public* card may be in the clear), and serialize as `cp-blob-` + base64url(JSON).
- **FR-6.** Output MUST **auto-copy** to clipboard on success and offer **Download `.cpad`**; for sessions above the size threshold the UI MUST steer to file output (Q-16).
- **FR-7.** The result panel MUST state the trustless trade-off plainly: *no server holds this; if the blob is lost it cannot be recovered; it cannot be expired or revoked.*
- **FR-8.** To share with multiple recipients/tiers, the user MUST be able to produce **one blob per (recipient, tier)** (multi-recipient single-blob format is Q-14, a fast follow).

### Receive
- **FR-9.** The receive action MUST require an unlocked identity and accept a `cp-blob-…` string (or `.cpad` file).
- **FR-10.** Decryption MUST use PRD-05's `openBlob`: derive `KW = HKDF(ECDH(myPriv, eph))`, unwrap the content keys, decrypt `body` always and `secret` only if `ks` was granted **and** the `secret` ciphertext is present.
- **FR-11.** If the blob is **not addressed to the current identity** (or is corrupt), decryption MUST **fail closed** with a clear message ("not addressed to you / corrupt") and MUST NOT render partial output. (This is the AES-GCM auth failure path - `poc/verify.mjs` [3].)
- **FR-12.** On success the UI MUST show the **tier** (body / body+secrets) and the **sender's fingerprint** with "trust only if it matches theirs"; the sender name MUST be labeled self-claimed/unverified.
- **FR-13.** The decrypted `{ redactedSession, secretMap? }` MUST be handed to the **viewer (PRD-03)**: body-only renders placeholders; body+secrets substitutes real values (PRD-06 placeholder rules; PRD-03 secret rendering).
- **FR-14.** A body-only blob MUST NOT contain the secret ciphertext at all (FR-4), so a body-only recipient cannot even attempt to recover secrets.

### Integrity & honesty
- **FR-15.** The blob format MUST be **versioned** (`v`); an unknown version MUST yield a clear "unsupported blob" error.
- **FR-16.** The UI MUST nowhere imply the sender is cryptographically verified (sealed-box is anonymous-sender); only the fingerprint-match is offered as trust.
- **FR-17.** Nothing in the share or receive flow may perform a network request with session content or keys (there is no backend; a test MUST assert zero network egress of sensitive data).

## 6. Technical design

### 6.1 Modules
```
packages/client/src/share/
  blob.ts      // createBlob / openBlob orchestration (uses PRD-05 crypto, PRD-10 identity)
  share-ui.tsx // recipient input + fingerprint confirm + tier + output
  receive-ui.tsx // paste/upload + decrypt + sender fingerprint + hand to viewer
```
`createBlob`/`openBlob` are the exact functions verified in `poc/` (PRD-05 owns the primitives; this PRD owns the orchestration + UI).

### 6.2 Sealed-box recap (from `TRUSTLESS-MODEL.md` §3)
- Per share: ephemeral ECDH keypair `E`; `KW = HKDF(ECDH(E_priv, Rpub))`; wrap `{kb, ks?}` under `KW`; encrypt `body` with `K_body`, `secret` with `K_secret`.
- Recipient: `KW = HKDF(ECDH(Rpriv, E_pub))` (ECDH symmetric) → unwrap → decrypt.
- Ephemeral `E` per share ⇒ recipient sets are unlinkable across blobs + forward secrecy on the wrap.

### 6.3 Trade-offs
- **One blob per recipient** (v1) is simple and leaks nothing about other recipients; the single-blob-multi-recipient format (Q-14) saves re-encryption but needs trial-unwrap and exposes the recipient count. Lean per-recipient in v1, multi-recipient as a fast follow.
- **Clipboard vs file:** clipboard is frictionless for small sessions; large ones must use a file (Q-16).
- **Anonymous-sender:** simpler, no signing key management; the cost is no cryptographic sender proof (fingerprint + optional vNext signature cover it).

## 7. Data model / blob format

```ts
export const BLOB_VERSION = 1 as const;
type B64Url = string;
type EncLayer = { iv: B64Url; ct: B64Url };          // AES-256-GCM (tag suffixed in ct)

export type ShareBlob = {
  v: 1;
  alg: 'ECDH-P256+HKDF-SHA256+AES-256-GCM';
  eph: B64Url;                       // ephemeral ECDH public key (raw)
  from: { name: string; pub: B64Url }; // sender's PUBLIC card (informational, unverified)
  tier: 'body' | 'body+secret';
  wrap: EncLayer;                    // AES-GCM(KW, JSON{ kb, ks? })  - KW from ECDH(eph, recipient)
  body: EncLayer;                    // AES-GCM(K_body, redactedSession JSON)
  secret: EncLayer | null;           // AES-GCM(K_secret, secretMap JSON) | null at body-only tier
};
// serialized: 'cp-blob-' + base64url(utf8(JSON.stringify(blob)))
```
- `wrap` plaintext = `JSON{ kb: b64url(rawK_body), ks?: b64url(rawK_secret) }`.
- `body` plaintext = JSON of the **redacted `Session`** (PRD-02 model; secrets → opaque `S#` by PRD-06).
- `secret` plaintext = JSON of the **secret map** `{ S1: "sk-live-…", … }` (PRD-06).
- This is exactly the PoC's blob (`poc/trustless-share.html`), promoted to the spec.

## 8. Security & privacy

Conforms to `TRUSTLESS-MODEL.md` §3/§5/§7 and `_context.md` §5:
- **Only the recipient can read it** - a non-recipient derives a different `KW`; AES-GCM auth fails (FR-11; `poc/verify.mjs` [3]). "Low-priv cannot see secrets" is mathematical: body-only blobs omit the secret ciphertext entirely (FR-14).
- **No plaintext on the wire/at rest** - the blob carries only ciphertext + the sender's public card (FR-5; `poc/verify.mjs` [4]).
- **No server** - nothing is uploaded; trust requires no host (FR-17).
- **Verifiable, not assumed** - recipient and sender fingerprints (FR-2, FR-12); name is self-claimed (FR-16).
- **Honest trade-offs (documented):** no recall/expiry/revocation/availability (FR-7); anonymous-sender (FR-16); a recipient can leak onward (social, not crypto); unlocked private key in memory (PRD-10 §8).
- **Best-effort redaction** - a missed secret sits in the body plaintext, visible to every recipient who can open the body; mandatory review (PRD-06) is the guard. This PRD does not weaken it.

## 9. Dependencies

**Upstream:** PRD-02 (session), PRD-06 (`{ redactedSession, secretMap }` + placeholders), PRD-05 (crypto/`createBlob`/`openBlob`), PRD-10 (identities + fingerprints), PRD-04 (share entry points), PRD-01 (UI).
**Downstream:** PRD-03 (renders the decrypted session), PRD-08 (playback of a decrypted session), PRD-09 (security review).

## 10. Acceptance criteria / DoD

- [ ] Share requires unlocked identity + valid recipient key; shows recipient fingerprint to confirm (FR-1, FR-2).
- [ ] Tier choice gates the secret layer; body-only blob has `secret: null` and no secret ciphertext (FR-3, FR-4, FR-14).
- [ ] Blob conforms to §7, contains no plaintext, serializes as `cp-blob-…`, auto-copies, and downloads as `.cpad` (FR-5, FR-6).
- [ ] Receive decrypts at the granted tier; non-recipient / corrupt → fail closed, no partial render (FR-10, FR-11).
- [ ] Sender fingerprint shown on decrypt; name labeled unverified (FR-12, FR-16).
- [ ] Decrypted session renders in the viewer; body-only shows placeholders, body+secrets substitutes (FR-13).
- [ ] **No-network test:** share + receive perform zero egress of session content or keys (FR-17).
- [ ] Production `createBlob`/`openBlob` keep `poc/verify.mjs` (16 checks) green.
- [ ] Versioned blob; unknown version → clear error (FR-15).

## 11. Open questions

- **Q-14 (multi-recipient blob):** one blob with an array of per-recipient wrapped entries (trial-unwrap; exposes recipient count) vs. one blob per recipient (simple; leaks nothing). Lean per-recipient in v1, multi-recipient fast follow.
- **Q-16 (large blobs):** clipboard size threshold to auto-switch to `.cpad` file; consider chunking/compression (PRD-05 may add deflate-before-encrypt).
- **Q-18 (sender authenticity):** add an optional detached signature so a recipient can cryptographically verify the sender (not just fingerprint-match). vNext-candidate.
- **New OQ-A:** should the share dialog remember recent recipients (address book, PRD-10 OQ-C) to avoid re-pasting keys? Lean fast-follow.
- **New OQ-B:** include a short human-readable header inside the `.cpad` file (e.g. "claudepad encrypted share for <fingerprint>") so a finder knows what it is? Lean yes (UX), ensure it leaks nothing.

## 12. Phase / milestone

**Phase P3 - Trustless Sharing (the moat).** Build order: after PRD-10 (identity) and PRD-06 (redaction); the headline capability of v1. Gating for v1: independent security review (PRD-09) covers PRD-05/06/10/11 together.
