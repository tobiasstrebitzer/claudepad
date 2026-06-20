# PRD-06 — Secret Detection & Tiered Reveal

**Phase:** P3 (Secrets — *the moat*) · **Status:** Draft
**Owners:** Secrets/redaction track
**Depends on:** PRD-02 (normalized model), PRD-05 (content keys + recipient wrap) · **Consumed by:** PRD-11 (fills the blob's secret layer) · **Rendered by:** PRD-03 (placeholders)

> **Serverless-v1 note (DECISIONS D-23):** unchanged in substance. The scanner + mandatory review produce `{ redactedSession, secretMap }`; the **secret map now fills the recipient-wrapped blob's `secret` layer (PRD-11 §7)**, encrypted under `K_secret`. **Tiering is per-recipient via key wrapping** (body-only omits the secret layer; body+secrets includes it) — not via two URL fragments. Placeholder rules (opaque IDs, not hashes) and best-effort honesty are exactly as before.
>
> Read [`_context.md`](./_context.md), [`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md), and [`../SECURITY-MODEL.md`](../SECURITY-MODEL.md) first. This PRD conforms to them; if a conflict exists, those files win.

---

## 1. Summary & problem

A Claude Code session is dense with credentials: `.env` dumps echoed into the terminal, `AKIA…` keys in AWS CLI output, `ghp_…` tokens in `git` calls, `Bearer …` headers in `curl`, JWTs, connection strings, PEM private keys pasted for debugging. Sharing such a session naively leaks them. PRD-05 makes the host blind to content, but it does **not** decide *what is a secret* or split the body from the secret map — that is this PRD's job.

PRD-06 delivers the **moat**: a fully client-side scanner that finds candidate secrets in the normalized session, a **mandatory** review-before-share UI where the human confirms or corrects every detection, and the construction of the **redacted body** (secrets → opaque IDs `S1, S2, …`) plus the **encrypted secret map** that fills PRD-05's `K_secret` envelope. The result is two trust tiers from one upload: low-priv links render `[AWS_KEY ••••••••(20)]` placeholders; high-priv links substitute real values back in. Detection is honest best-effort — a missed secret stays in plaintext in the all-tiers body — so the review step is load-bearing and never skipped.

## 2. Goals / Non-goals

### Goals
- **G1.** Scan the normalized `Session` (PRD-02) entirely client-side for secrets via three independent signals: known token **prefixes/shapes**, **Shannon-entropy** heuristics, and **exact match** against user-pasted `.env`/`.dev.vars` values.
- **G2.** Present a **mandatory** review UI listing every detection in context; let the user add, remove, edit, merge, and re-classify detections, with type + length labels and bulk actions. **Never auto-publish.**
- **G3.** Construct a **redacted body** (each confirmed secret occurrence → an opaque random ID `S1, S2, …`) and a **secret map** `{ S1: value, … }` that PRD-05 encrypts under `K_secret`.
- **G4.** Conform exactly to the **placeholder rules** (SECURITY-MODEL §"Placeholder design"): opaque ID + type+length label, **never a hash**.
- **G5.** Bias toward **recall** (catch more, miss fewer) with **easy one-click dismissal** of false positives — resolving open question **Q-4**.
- **G6.** Surface **honest best-effort messaging** so users understand detection is imperfect and the review is their responsibility.
- **G7.** Ship a **labeled test corpus** with documented **recall/precision targets** and a regression harness.

### Non-goals
- **N1.** Server-side or networked scanning of any kind (breaks zero-knowledge; SECURITY-MODEL §5.5 Strict-only). The scanner runs offline.
- **N2.** Defining the crypto primitives, key derivation, recipient wrapping, or blob/tier mechanics — **owned by PRD-05/PRD-11**. This PRD only *fills* the `K_secret` slot and *consumes* tier semantics.
- **N3.** Inline rendering of placeholders and substituted reveal in the transcript — **owned by PRD-03**. This PRD specifies the contract (the placeholder string format and substitution map) PRD-03 renders.
- **N4.** Per-recipient / named secret access (X25519 wrapping) — vNext (SECURITY-MODEL §vNext); this PRD must not preclude it (see §8).
- **N5.** Guaranteeing zero leakage. Detection is best-effort; we surface limits, we do not promise completeness.
- **N6.** Secret *rotation* advice or integration with vaults/secret managers.

## 3. Personas & user stories

- **As a Sharer**, I want the tool to find the obvious tokens automatically so that I don't have to eyeball a 2,000-line transcript for `sk-…` strings.
- **As a Sharer**, I want to paste my project's `.env` so that values unique to me (a DB password with no recognizable shape) are caught exactly, not by luck.
- **As a Sharer**, I want to review every detection in its surrounding context and dismiss false positives in one click so that the scanner can be aggressive without making me fight it.
- **As a Sharer**, I want to hand-select a string the scanner missed and mark it secret so that nothing slips into the body.
- **As a Sharer**, I want to be told plainly that detection is best-effort so that I take the review seriously and don't assume the tool is infallible.
- **As a Low-priv viewer**, I want redacted secrets to show a type+length hint so that the transcript still reads sensibly without exposing the value or a crackable fingerprint.
- **As a High-priv viewer**, I want the same transcript with real values restored so that I can actually use the session (e.g. reproduce a command).
- **As a Self-hoster**, I want detection to be identical client-side code so that there is no security penalty for self-hosting (ROADMAP principle 5).

## 4. UX & flows

### 4.1 Where this sits in the share flow

```
PRD-04 ingest ─▶ PRD-02 parse ─▶ PRD-03 view
                                     │
                                     ▼  user clicks "Share"
                          ┌──────────────────────────┐
                          │ PRD-06: SCAN              │  (entropy + prefixes + .env)
                          └──────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │ PRD-06: REVIEW (mandatory)│  ← cannot be skipped
                          └──────────────────────────┘
                                     │ user confirms
                                     ▼
                          ┌──────────────────────────┐
                          │ PRD-06: REDACT            │  body + secret map
                          └──────────────────────────┘
                                     │
                                     ▼
                          PRD-05 encrypt (K_body, K_secret) ─▶ PRD-11 recipient-wrapped blob
```

### 4.2 Review-before-share UI (ASCII wireframe)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Review before sharing                                          [ Cancel ]   │
│  ⚠  Detection is best-effort. Anything left UN-redacted is visible to        │
│     EVERYONE you share with — including low-privilege links. Review every     │
│     item. Add anything we missed.                                            │
├────────────────────────────────────────────────────────────────────────────┤
│  Paste a .env / .dev.vars to match exact values  [ Paste… ]   0 matched      │
│  Entropy sensitivity:  ●──────────  (recall-biased)            [ Rescan ]     │
├────────────────────────────────────────────────────────────────────────────┤
│  14 detections · 12 will be redacted · 2 dismissed                           │
│  [✓ Redact all] [✗ Dismiss all] [Merge selected] [Type ▾] filter: [all ▾]    │
├──────┬───────────────┬───────────┬───────────────────────────────┬──────────┤
│ ☑ S1 │ AWS_KEY  (20) │ prefix    │ …aws s3 ls --profile          │ [edit]   │
│      │               │ entropy ✓ │ AKIA••••••••••••EXMPL  ↩ event#42 line 3│        │
├──────┼───────────────┼───────────┼───────────────────────────────┼──────────┤
│ ☑ S2 │ GH_TOKEN (40) │ prefix    │ git remote set-url origin     │ [edit]   │
│      │               │           │ https://ghp_••••••••@github…  ↩ event#51│        │
├──────┼───────────────┼───────────┼───────────────────────────────┼──────────┤
│ ☐ S3 │ HIGH_ENTROPY  │ entropy   │ build hash: a9f3c1••••••(32)  ↩ event#63│       │
│  (dismissed — looks like a content hash)                          [restore]  │
├──────┼───────────────┼───────────┼───────────────────────────────┼──────────┤
│ ☑ S4 │ ENV: DB_PASS  │ .env exact│ DATABASE_URL=postgres://u:••• ↩ event#70│ [edit]│
├──────┴───────────────┴───────────┴───────────────────────────────┴──────────┤
│  + Add detection — select text in the transcript, or [ Paste literal… ]       │
├────────────────────────────────────────────────────────────────────────────┤
│  When you publish, low-priv viewers see  [DB_PASS ••••••••(18)] ;             │
│  high-priv viewers see the real value.                                       │
│                                            [ Back to transcript ] [ Publish ▸]│
└────────────────────────────────────────────────────────────────────────────┘
```

Notes on the wireframe:
- Every row shows: opaque ID, **type + length** label, the **signal(s)** that fired (prefix / entropy / .env exact — a detection may be backed by more than one), an **in-context snippet** with the candidate masked, and a jump-link to the event/line.
- The masked snippet shows only enough characters to locate the match (first few of a known prefix), never enough to reconstruct or fingerprint the value.
- Checkbox = "redact this." Unchecking dismisses it (leaves it in plaintext in the body). Dismissed rows are visually distinct and restorable.
- **Bulk actions:** redact-all, dismiss-all, merge selected (treat several rows as one logical secret sharing one `S#`), filter by type/signal, change type via the `Type ▾` menu.
- **Add detection:** select text in the transcript pane and "mark as secret," or paste a literal value to redact every occurrence of.
- `Publish` is disabled until the user has visibly reached the bottom / acknowledged the review (see FR-19); the flow cannot be bypassed.

### 4.3 Edit / merge interactions
- **Edit** a detection: adjust its exact span (trim/extend selection), override its detected **type** (the label shown low-priv), or correct the value used in the secret map.
- **Merge:** select multiple rows → one `S#`. Used when the same credential appears in several forms (raw, URL-encoded, base64) and the user wants them grouped; each underlying span still gets substituted, but they share one map entry/label.
- **Split** is implicit: an over-greedy span is fixed by editing it down or dismissing + re-adding.

## 5. Functional requirements

Numbered, testable. Unless noted, "the scanner/redactor" runs **client-side only**.

### Scanning
- **FR-1.** The scanner SHALL accept a normalized `Session` (PRD-02 §6) and walk all rendered text: `text`/`code` content blocks of `user`/`assistant`/`thinking` events, `tool_use.input`, and `tool_result.output` (stringified). Non-text blocks (`image`, `raw`) SHALL be scanned only insofar as they carry stringifiable content; binary/opaque refs are skipped.
- **FR-2.** The scanner SHALL detect secrets via **three independent signals**, each attributable per detection: (a) **prefix/shape** regexes (taxonomy §7.3), (b) **Shannon-entropy** over candidate tokens, (c) **exact match** against user-supplied `.env`/`.dev.vars` values.
- **FR-3.** Each detection SHALL record: a stable location (`eventIndex`, content-block index, character `start`/`end`), the matched **value**, a **type** label, the **signal(s)** that fired, and a **confidence** ordering signal (used only for sort/UI; never shown to viewers).
- **FR-4.** **Entropy heuristic:** for token-like substrings (length ≥ configurable min, default 20; charset base64/hex/url-safe), compute normalized Shannon entropy; flag those above a threshold tied to the **sensitivity** control. The default position SHALL be **recall-biased** (Q-4): a lower threshold that over-flags, paired with easy dismissal. The threshold SHALL be a single user-facing "sensitivity" control, not a raw number.
- **FR-5.** Entropy SHALL apply documented **suppressors** to cut obvious false positives without hiding real secrets: known content-hash shapes (git SHA-1/40-hex, sha256/64-hex when adjacent to hash-y context words), UUIDs, ISO timestamps, file paths, and base64 of recognizably non-secret data are *down-ranked* (still shown, pre-dismissed-suggested) — never silently dropped (conforms to SECURITY-MODEL §Limits "never hidden").
- **FR-6.** **`.env` exact match:** the user MAY paste one or more `.env`/`.dev.vars` blobs. The scanner SHALL parse `KEY=VALUE` lines (handling quotes, `export `, comments, blank lines) and flag **every occurrence** of each non-trivial VALUE anywhere in the session, labeled with its KEY (e.g. `ENV: DB_PASS`). Pasted `.env` content SHALL live only in memory and SHALL NOT be uploaded, logged, or persisted.
- **FR-7.** The scanner SHALL ignore trivially-short or low-value `.env` values (configurable min length, default 8; skip pure booleans/integers/`localhost`/common ports) to avoid redacting half the transcript — but SHALL list what it skipped so the user can force-include.
- **FR-8.** Overlapping/duplicate detections of the same value SHALL be coalesced so one logical secret maps to one `S#` while still substituting **all** of its occurrences.
- **FR-9.** Scanning SHALL be deterministic and idempotent for a given session + settings, and SHALL run incrementally on **Rescan** when sensitivity or `.env` input changes, preserving the user's manual add/dismiss/edit decisions across rescans.
- **FR-10.** Scanning of a large session SHALL not block the UI: it SHALL run in a Web Worker (or yield cooperatively) and report progress; target < 1s for a typical session and a bounded, cancellable run for pathological inputs (§6 perf budget).

### Review UI (mandatory)
- **FR-11.** The share flow SHALL route through the review UI **before any encryption**. There SHALL be no code path that produces a share blob without the user passing through review. (Enforced by PRD-11's share entrypoint requiring this PRD's confirmed redaction output.)
- **FR-12.** The UI SHALL list **every** detection with: opaque ID, type+length label, firing signal(s), an in-context masked snippet, and a jump-to-location link.
- **FR-13.** The user SHALL be able to **redact** (default for non-suppressed detections) or **dismiss** each detection individually, and **restore** a dismissed one.
- **FR-14.** The user SHALL be able to **add** a detection by (a) selecting transcript text and marking it secret, or (b) pasting a literal value to redact all occurrences of.
- **FR-15.** The user SHALL be able to **edit** a detection's span, **override its type** label, and **correct its value**.
- **FR-16.** The user SHALL be able to **merge** selected detections into a single `S#` (shared label), and the redactor SHALL substitute all merged spans.
- **FR-17.** The UI SHALL provide **bulk actions**: redact-all, dismiss-all, merge-selected, filter by type/signal, and select-by-type.
- **FR-18.** The UI SHALL display, for each detection, exactly what a **low-priv** viewer will see (the placeholder) and confirm that a **high-priv** viewer sees the real value — so the user understands the tier consequence before publishing.
- **FR-19.** The UI SHALL require an explicit acknowledgement of best-effort limits (e.g. the user must have scrolled the full list / checked an "I've reviewed these" affordance) before **Publish** is enabled. Honest messaging (SECURITY-MODEL §Limits) SHALL be visible, not buried in a tooltip.

### Redaction output
- **FR-20.** On confirm, the redactor SHALL produce a **redacted body**: a structurally-identical copy of the normalized `Session` in which each confirmed secret span is replaced by an **opaque placeholder token** carrying its `S#` ID and type+length label (format §7.1). The placeholder is the *only* representation of the secret in the body.
- **FR-21.** The placeholder SHALL be an **opaque random ID + type + length** — **NEVER** a hash, prefix, or any function of the plaintext value (SECURITY-MODEL §Placeholder design; D-4). Length shown is the character count of the original value; type is the (possibly user-overridden) label.
- **FR-22.** `S#` IDs SHALL be assigned from a **per-session random** namespace (not sequential global, not derived from the value) so they leak nothing and don't collide across sessions; ordering in the map SHALL NOT reveal document order in a way that aids correlation (IDs randomized, not positional).
- **FR-23.** The redactor SHALL produce a **secret map** `{ S#: { value, type, len } }` containing the plaintext values, handed to **PRD-05** to encrypt under `K_secret`. The map SHALL NOT be written to disk, logged, or included in the body ciphertext.
- **FR-24.** Any detection the user **dismissed** SHALL remain as **plaintext** in the redacted body. This is by design and disclosed (SECURITY-MODEL §Limits): the body is the all-tiers layer.
- **FR-25.** The redacted body SHALL be byte-for-byte free of every confirmed secret value (verifiable test: no map plaintext appears as a substring of the serialized body). This is a hard acceptance gate (§10).
- **FR-26.** The redactor SHALL preserve PRD-02's "unknown fields preserved, never crash" invariant: redaction only rewrites the spans it owns and copies everything else through unchanged.
- **FR-27.** The output contract handed to PRD-05 SHALL be `{ body: Session (redacted), secretMap: Record<SID, SecretEntry> }`; PRD-05 owns encrypting `body`→`K_body` and `secretMap`→`K_secret` (§7.4 envelope).

### Reveal semantics (contract with PRD-03 / PRD-05)
- **FR-28.** **Low-priv** (`#<K_body>` only): the viewer decrypts the body, has no secret map, and renders placeholders as their type+length label (PRD-03). No value is recoverable.
- **FR-29.** **High-priv** (`#<K_body>.<K_secret>`): the viewer additionally decrypts the secret map and substitutes each `S#` placeholder with its real value at render time (PRD-03). Substitution SHALL be safe against placeholder forgery (a placeholder whose `S#` is absent from the map renders as its label, never as raw text that could be mistaken for content).
- **FR-30.** The placeholder format SHALL be unambiguously machine-parseable by PRD-03 (a sentinel-wrapped token) yet render as the human label; PRD-03 owns visual styling (mono, muted), this PRD owns the token grammar (§7.1).

### Honesty / limits
- **FR-31.** The UI SHALL state, in plain language, that detection is best-effort, that **missed** secrets are visible to **all** tiers, and that the user is responsible for the final review (SECURITY-MODEL §Limits; ROADMAP principle 3).
- **FR-32.** The product SHALL ship a documented **recall/precision** statement (from §10 corpus results) and link to it from the review UI ("how good is detection?").

## 6. Technical design

### 6.1 Module layout (shared types package + client)
```
packages/secrets/
  scan/
    prefixDetectors.ts   # taxonomy §7.3 regexes, each a typed Detector
    entropyDetector.ts   # tokenizer + Shannon entropy + suppressors (FR-4,5)
    envMatcher.ts        # .env/.dev.vars parse + exact-match (FR-6,7)
    coalesce.ts          # dedupe/merge to logical secrets (FR-8)
    scan.ts              # orchestrator over normalized Session (FR-1..3)
    worker.ts            # off-main-thread runner (FR-10)
  redact/
    placeholder.ts       # token grammar + type+length label (§7.1, FR-20..22)
    redactBody.ts        # Session → redacted Session (FR-20,24..26)
    buildSecretMap.ts    # { S#: entry } (FR-23)
  model.ts               # Detection, SecretEntry, ScanSettings types
packages/secrets/test/
  corpus/                # labeled fixtures (§10)
  *.test.ts              # vitest
```
The scanner consumes PRD-02's `Session`; the redactor emits a `Session` + `secretMap`; PRD-05 consumes that. No DOM dependency in `scan/`/`redact/` (pure, testable, worker-safe). The review UI lives in the client app (`packages/client`), built on PRD-01's design system + shadcn/base-ui.

### 6.2 Detection pipeline
1. **Tokenize** rendered text per event/block, tracking absolute spans back to the normalized model.
2. Run the **three detectors** independently; each emits candidate spans with a type + signal.
3. **Coalesce** (FR-8): merge identical/overlapping values to one logical secret (collect all spans).
4. **Suppress/down-rank** (FR-5): tag obvious false-positive shapes; keep them but pre-suggest dismissal.
5. Emit `Detection[]` sorted recall-first (high-confidence prefix matches top, entropy below, suppressed at bottom).

### 6.3 Key trade-offs
- **Recall vs. precision (Q-4):** we deliberately bias recall. Cost is false positives; mitigated by (a) trivially easy dismissal, (b) suppressors that *down-rank* (not drop) hashes/UUIDs/paths, (c) a sensitivity slider. We accept a noisier list over a missed credential, because a miss leaks to all tiers and a false positive costs one click. This is the documented answer to Q-4.
- **Entropy is dumb on its own:** high entropy ≠ secret (minified JS, base64 images, hashes). We never rely on entropy alone for silent action — entropy findings always surface for human review and are the most aggressively suppressed class.
- **`.env` paste is the highest-precision signal** but requires user effort; we make it prominent because it catches shapeless secrets nothing else can. It is memory-only.
- **Worker isolation** keeps the UI responsive on huge sessions and keeps secret-bearing strings off the main thread's long-lived closures where feasible.
- **No regex on ciphertext, ever:** scanning happens pre-encryption on plaintext in memory; nothing leaves the client.

### 6.4 Performance budget
- Typical session (≤ ~5k events / few MB text): full scan < 1s in a worker.
- Pathological input: bounded, cancellable; progress reported; the review UI streams detections as they arrive.

## 7. Data model / API

### 7.1 Placeholder token grammar (this PRD owns; PRD-03 renders)
A placeholder embedded in the redacted body is a sentinel-wrapped, machine-parseable token. Indicative form:

```
⟦SECRET:S<id>⟧            # opaque, no value-derived data
# carries (via the secret-map entry / body sidecar) → type + length for the label
```

Rendered label (PRD-03), low-priv and inside high-priv before/while revealing:

```
[AWS_KEY ••••••••(20)]     # type + masked dots + length; never a hash/prefix
```

- `S<id>` is a per-session random identifier (FR-22).
- The **type** and **length** needed to render the low-priv label travel in the **body** (they leak nothing: type is a class name, length is a count — neither reconstructs the value and neither is a crackable fingerprint). The **value** travels only in the `K_secret`-encrypted map.
- Rationale (SECURITY-MODEL §Placeholder design, D-4): a hash would be one-way (defeating high-priv reveal) and, for low-entropy secrets, offline-brute-forceable from the public placeholder. Opaque ID + type/length leaks neither value nor fingerprint.

### 7.2 Core types (indicative)
```ts
type SignalKind = 'prefix' | 'entropy' | 'env-exact';

type Detection = {
  id: string;                 // S# opaque random (FR-22)
  type: string;               // label class, e.g. 'AWS_KEY', 'ENV:DB_PASS'
  value: string;              // plaintext (memory only)
  length: number;             // chars of value, for the label
  spans: SourceSpan[];        // every occurrence in the normalized model
  signals: SignalKind[];      // why it fired (≥1)
  confidence: number;         // ordering only; never rendered to viewers
  state: 'redact' | 'dismissed';
  suppressedReason?: string;  // e.g. 'looks like a git SHA'
  userEdited?: boolean;
};

type SourceSpan = { eventIndex: number; blockIndex: number; start: number; end: number };

type SecretEntry = { value: string; type: string; len: number };  // → encrypted map
type SecretMap  = Record<string /*S#*/, SecretEntry>;

type ScanSettings = {
  entropySensitivity: number;     // 0..1, default recall-biased
  envBlobs: string[];             // pasted .env/.dev.vars, memory only
  envMinValueLength: number;      // default 8 (FR-7)
  entropyMinTokenLength: number;  // default 20 (FR-4)
};

type RedactionResult = {
  body: Session;                  // redacted, placeholders in place (FR-20)
  secretMap: SecretMap;           // handed to PRD-05 → K_secret (FR-23,27)
};
```

### 7.3 Detector taxonomy

| Type label | Signal | Shape / rule (indicative) | Notes |
|---|---|---|---|
| `OPENAI_KEY` | prefix | `sk-`, `sk-proj-`, `sk-ant-…` + base62 body | LLM/API keys; high confidence |
| `GH_TOKEN` | prefix | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` + 36 base62 | GitHub PAT/OAuth/app tokens |
| `AWS_KEY` | prefix | `AKIA`/`ASIA`/`AGPA…` + 16 A–Z0–9 (20 total) | AWS access key id; pair with secret-key entropy |
| `AWS_SECRET` | entropy+context | 40-char base64 near `aws_secret`/`AKIA` context | shapeless → entropy + proximity |
| `GOOGLE_API_KEY` | prefix | `AIza` + 35 url-safe | Google API key |
| `SLACK_TOKEN` | prefix | `xox[baprs]-…` | Slack bot/user/app tokens |
| `STRIPE_KEY` | prefix | `sk_live_`, `sk_test_`, `rk_live_`, `pk_live_…` | flag live + test |
| `JWT` | shape | `eyJ` header `.` payload `.` signature (3 b64url parts) | structural; decode header to confirm |
| `PEM_PRIVATE_KEY` | block | `-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----` … `-----END …-----` | multi-line block; redact whole block |
| `BEARER_TOKEN` | shape | `Authorization: Bearer <token>` / `Bearer eyJ…` | token after `Bearer ` |
| `CONNECTION_STRING` | shape | `scheme://user:pass@host…` (`postgres`,`mysql`,`mongodb`,`redis`,`amqp`,…) | redact the `pass` (and optionally whole URI) |
| `SLACK_WEBHOOK` | prefix | `https://hooks.slack.com/services/…` | webhook URL |
| `PRIVATE_KEY_HEX` | entropy | long hex (e.g. 64) in key-ish context | e.g. crypto private keys |
| `HIGH_ENTROPY` | entropy | base64/hex token ≥ min length, entropy ≥ threshold, not suppressed | catch-all; most aggressively suppressed |
| `ENV:<KEY>` | env-exact | exact match of a pasted `.env` VALUE | highest precision; user-supplied |

> The table is the **starting** taxonomy; detectors are data-driven (FR-2/FR-3) so adding a prefix is a config change, not an architecture change. Live vs. test variants (e.g. Stripe) are both flagged; the user decides.

### 7.4 Envelope hand-off (PRD-05 owns crypto)
```
PRD-06 → RedactionResult { body, secretMap }
                    │                 │
        PRD-05 encrypt│                 │PRD-05 encrypt
                    ▼                 ▼
            ciphertext_body      ciphertext_secretMap
              (K_body)              (K_secret)
                    └──────┬──────────┘
              PRD-11 cp-blob — content keys WRAPPED to recipient
   Body-only grant     wrap{ kb }          → body only (no secret ciphertext)
   Body+secrets grant  wrap{ kb, ks }      → body + map (reveal)
```
This PRD defines **what** fills the `secretMap` slot and the **body** placeholder grammar; PRD-05 defines key generation, GCM encryption, and the recipient wrap; PRD-11 assembles the resulting `cp-blob`.

### 7.5 Redaction data flow (end to end)
```
 normalized Session (PRD-02)
        │
   [scan.ts]  prefix ∪ entropy ∪ env-exact  ─▶  Detection[]   (FR-1..8)
        │
   [Review UI]  add / dismiss / edit / merge / bulk            (FR-11..19)
        │  user confirms (Publish)
        ▼
   [redactBody.ts]   replace confirmed spans → ⟦SECRET:S#⟧     (FR-20..22,24..26)
   [buildSecretMap.ts]  { S#: {value,type,len} }                (FR-23)
        ▼
   RedactionResult { body, secretMap }  ──▶  PRD-05 envelope (§7.4)
        │
        └─ ASSERT: no secretMap value is a substring of serialize(body)  (FR-25, §10 gate)
```

## 8. Security & privacy

Conforms to `_context.md` §5 and `SECURITY-MODEL.md`:

- **Zero-knowledge (§5.1):** all scanning/redaction is client-side; only PRD-05's ciphertext is uploaded. Pasted `.env` content, detection values, and the secret map are **memory-only** (FR-6, FR-23) — never logged, persisted, or sent.
- **Two-key tiered reveal (§5.2, D-3):** the body (placeholders) and the secret map are separated *before* PRD-05 encrypts them under independent keys. Low-priv literally lacks `K_secret`, so "low-priv can't see secrets" is a math fact, not a UI gate.
- **Placeholder rules (§5.3, D-4):** opaque random `S#` + type+length label only; **never a hash/prefix/value-derived fingerprint** (FR-21/FR-22). Rationale carried verbatim from SECURITY-MODEL.
- **Best-effort, surfaced (§5.4, D-5):** review-before-share is mandatory and unskippable (FR-11, FR-19); dismissed/missed secrets remain plaintext in the all-tiers body and this is disclosed (FR-24, FR-31). Suppressors down-rank, never silently drop (FR-5).
- **Risks introduced & mitigations:**
  - *Over-greedy redaction* breaks readability → user edits span / dismisses (FR-13, FR-15); suppressors reduce noise.
  - *False sense of safety* from automation → honest messaging + forced acknowledgement (FR-19, FR-31, FR-32).
  - *`.env` paste itself is sensitive* → memory-only, never uploaded; cleared on flow exit; warned in UI.
  - *Placeholder forgery* (a value in source that looks like `⟦SECRET:S#⟧`) → sentinel grammar is chosen to be improbable and the redactor escapes/neutralizes any literal sentinel occurring in source before redaction so it can't be confused with a real token (FR-29/FR-30).
  - *Length leak:* showing length is an accepted, documented minor leak (a count, not a value); SECURITY-MODEL explicitly endorses type+length labels.
- **vNext non-preclusion (§5.8):** the secret map is a flat `{ S#: entry }` keyed by opaque IDs; wrapping it (or per-`S#` subsets) to X25519 recipient keys later requires no change to detection/redaction — only to how PRD-05 encrypts the already-separated map.

## 9. Dependencies

- **Upstream — PRD-02 (parser/model):** scanner input is the normalized `Session`; spans reference its indices; "preserve unknown, never crash" is inherited.
- **Upstream — PRD-05/PRD-11 (crypto + sharing):** PRD-05 owns `K_body`/`K_secret`, GCM encryption, and the recipient wrap; PRD-11 assembles the `cp-blob` and consumes this PRD's `RedactionResult`. The `secretMap` shape and body placeholder grammar are the agreed contract.
- **Downstream — PRD-03 (viewer):** renders placeholders as type+length labels (low-priv) and substitutes real values (high-priv). This PRD owns the token grammar; PRD-03 owns visual styling and substitution-at-render.
- **Adjacent — PRD-04 (ingest):** the "Share" entrypoint funnels into this PRD's scan→review.
- **Adjacent — PRD-07 (backend):** stores the two ciphertexts; never sees plaintext.
- **Adjacent — PRD-01 (design system):** the review UI uses its tokens/components.

## 10. Acceptance criteria / DoD

- [ ] **AC-1.** Scanner detects all three signal classes (prefix, entropy, env-exact) over the normalized model, attributing the firing signal per detection (FR-1–FR-3).
- [ ] **AC-2.** Entropy detection is recall-biased by default with a working sensitivity control and documented suppressors that down-rank (never drop) hashes/UUIDs/paths (FR-4, FR-5). — *resolves Q-4.*
- [ ] **AC-3.** `.env`/`.dev.vars` paste matches all occurrences of non-trivial values, labeled by KEY, memory-only (FR-6, FR-7).
- [ ] **AC-4.** Review UI lists every detection in context with type+length labels and supports add / remove / edit / merge / restore / bulk actions (FR-11–FR-18).
- [ ] **AC-5.** Publishing is impossible without passing through review and acknowledging best-effort limits; **no auto-publish path exists** (FR-11, FR-19) — covered by a Playwright test asserting the share flow blocks on review.
- [ ] **AC-6.** Redacted body uses opaque `S#` + type+length placeholders, **never hashes** (FR-20–FR-22) — unit test asserts no placeholder is a function of the value.
- [ ] **AC-7.** **Hard gate:** for every published artifact, no confirmed secret value appears as a substring of the serialized redacted body (FR-25). Automated test over the corpus.
- [ ] **AC-8.** Dismissed detections remain plaintext in the body and the UI discloses this (FR-24, FR-31).
- [ ] **AC-9.** `RedactionResult` hands PRD-05 a `{ body, secretMap }` matching the agreed contract; round-trip test: low-priv render shows labels, high-priv render restores values (FR-27–FR-30).
- [ ] **AC-10.** **Labeled test corpus** exists (synthetic sessions with ground-truth secret spans across every taxonomy type + decoys: git SHAs, UUIDs, base64 images, minified JS, lorem) and the scanner meets documented targets:
  - **Recall ≥ 0.95** on labeled true secrets (miss-averse, per Q-4).
  - **Precision reported, not gated below a floor** — target ≥ 0.5 *after suppressors*, with the explicit understanding that false positives are one-click-dismissable and recall is prioritized. The exact published numbers come from the corpus run and are documented (FR-32).
  - Zero **known-shape** misses (prefix-matchable secrets: 100% recall on `sk-`/`ghp_`/`AKIA`/PEM/JWT, etc.).
- [ ] **AC-11.** Scan runs off the main thread, reports progress, stays cancellable, and meets the < 1s typical-session budget (FR-10).
- [ ] **AC-12.** Honest best-effort messaging is visible in the UI and a recall/precision statement is published and linked (FR-31, FR-32).
- [ ] **AC-13.** No plaintext secret, `.env` paste, or secret map is logged, persisted, or uploaded (manual + automated network-capture check; ties to ROADMAP success metric "network capture contains no plaintext/secret").

## 11. Open questions

- **Q-4 (assigned to this PRD) — resolved here:** bias toward **recall** with easy dismissal. Default entropy threshold is recall-biased; suppressors down-rank rather than drop; the sensitivity slider lets power users trade off. Final published recall/precision numbers come from the §10 corpus run.
- **OQ-A.** Should `CONNECTION_STRING` redact only the password field or the entire URI by default? *Leaning:* default to password-only (preserves readable host/db), with a one-click "redact whole URI." Decide on corpus + UX testing.
- **OQ-B.** Should the sensitivity control be a discrete 3-step (Off / Balanced / Aggressive) or a continuous slider? *Leaning:* discrete presets backed by a continuous internal threshold; revisit after dogfooding.
- **OQ-C.** Do we ship any **bundled** common-`.env`-key heuristics (treat lines literally named `*_SECRET`, `*_TOKEN`, `*_PASSWORD` in echoed `.env` output as secrets even without a pasted `.env`)? *Leaning:* yes, low-risk recall win; verify on corpus.
- **OQ-D.** How should **merge** present its single label when merged spans have differing detected types? *Leaning:* user picks the canonical type on merge; default to the highest-confidence one.
- **OQ-E.** Should suppressed (down-ranked) detections default to **dismissed** or **redact-with-suggestion-to-dismiss**? Recall-bias argues for defaulting to redact; UX noise argues for pre-dismiss. *Leaning:* pre-suggest dismiss but keep them in the redact set unless the user acts — confirm via dogfooding (interacts with Q-4).

## 12. Phase / milestone

**Phase P3 — Secrets (the moat).** PRD-06 is the sole PRD of P3 and the product's core differentiator. Build order (ROADMAP §3): after PRD-02 (model), PRD-07 (backend), and PRD-05 (crypto envelope) — this PRD fills PRD-05's `K_secret` slot and feeds PRD-03's placeholder rendering. Gating for v1 launch (PRD-09): the labeled-corpus results and an independent security review of secret handling are pre-v1 requirements (SECURITY-MODEL §Pre-v1).
