# PRD-04 - Ingest & Share Output

> **Phase:** P1 (Local Prettify / MVP-0, bridging into P3 Trustless Sharing) · **Status:** Draft
> **Re-scoped by the serverless-v1 pivot (DECISIONS D-20…D-29).** "Share/publish/upload" is replaced by **produce an encrypted blob** (the PRD-11 `cp-blob`) and hand it to the user via **clipboard or `.cpad` file** - there is **no upload, no server, no link** in v1. The CLI and slash command output a blob (or a local prettified view), never an upload. An optional store (short URLs) is the vNext addon (`../STORE-PROVIDER-SPEC.md`) and must not be assumed or referenced in the v1 client.
> **Owner PRD for:** ingest surfaces (drag-drop, paste, CLI, slash command / Stop-hook), first-run onboarding, file-size handling, and the local-vs-share entry point (where "share" = encrypt-to-recipient via PRD-10/11).
> Canonical context: [`_context.md`](./_context.md). v1 design: [`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md). This PRD must not contradict either.

---

## 1. Summary & problem

claudepad's first promise is **easy** - the fewest possible steps from "I just had a useful Claude Code session" to "I'm looking at it prettified" (and, in P3, "I've got an encrypted blob for my teammate on my clipboard"). The raw material lives in undocumented `~/.claude/projects/<project>/<session>.jsonl` files that most users have never opened and cannot easily locate. This PRD defines every way a session *enters* claudepad: browser drag-and-drop, clipboard paste, a `claudepad` CLI, and a Claude Code custom slash command / Stop-hook for one-keystroke capture of the *current* session. It also defines the first-run/empty state that teaches users where their session files are per-OS, the file-size limits and large-file handling, and the explicit choice point between **local-only prettify** and **encrypt-for-a-recipient** (PRD-11). All of it is **client-side**: nothing is uploaded. The CLI/slash command produce a local view or an encrypted `.cpad` - they do **redaction + recipient-encryption locally** (or hand off to the local web app) and **never** transmit plaintext (there is no server to transmit to).

## 2. Goals / Non-goals

### Goals
- Make the **drop-or-paste → prettified view** path work fully offline, in well under 15 seconds, with zero configuration (success metric: time-to-share < 15s, see [ROADMAP §6](../ROADMAP.md)).
- Detect and correctly handle **all** the shapes a user might paste: a `.jsonl` file, a single JSON object, a JSON array, an NDJSON blob, or raw text that is *not* a session (graceful rejection with guidance).
- Provide a **first-run empty state** that locates `~/.claude/projects/*.jsonl` for the user across macOS, Linux, and Windows (incl. WSL), and helps them pick the *right* session.
- Ship a `claudepad` **CLI** (`claudepad share <file> --to <recipient>`, stdin pipe support) that produces an encrypted **blob** in one command, performing redaction + recipient-encryption locally (no network).
- Ship **at least one** one-keystroke capture path inside Claude Code (slash command and/or Stop-hook); lay out both and make a v1 recommendation (resolves open question **Q-6**).
- Make the **local-only vs. encrypt-for-a-recipient** decision explicit, never silent - nothing is produced for sharing without a deliberate action and a review step.

### Non-goals
- **No parsing logic here.** Normalization of JSONL → `Session` is owned by **PRD-02**; this PRD only acquires bytes and routes them.
- **No crypto / blob format here.** Client-side AES-GCM, the recipient wrap, and the `cp-blob` format are **PRD-05** (crypto core) and **PRD-11** (sharing). Ingest *invokes* them; identities are **PRD-10**.
- **No secret scanning / review UI here.** Detection + the mandatory review-before-share screen are **PRD-06**. Ingest must *route into* that screen before any encryption.
- **No render/viewer.** The prettified read experience is **PRD-03**.
- **No multi-source ingest** (Codex, Gemini, Cursor) - Claude Code only for v1 ([ROADMAP §5](../ROADMAP.md), D-12).
- **No accounts, no server, no auto-share.** Local-first, review-gated; nothing is uploaded (there is no server in v1). (D-2, D-5, D-20.)

## 3. Personas & user stories

- **As a Sharer**, I want to drag my session file onto the page and immediately see it rendered, so that I can confirm it's the right one before deciding anything.
- **As a Sharer**, I want to paste a session I copied from a terminal or a file, so that I don't have to hunt for the file on disk.
- **As a first-time user**, I want claudepad to *tell me* where my Claude Code sessions live on my OS and which one is the latest, so that I don't have to guess at hidden dotfiles.
- **As a CLI-comfortable Sharer**, I want to run `claudepad share latest --to steve` from my terminal and get an encrypted blob, so that I never leave the keyboard.
- **As a Claude Code power user**, I want to type a slash command (or have a hook fire on stop) that captures the session I just finished and gives me an encrypted blob for a known recipient, so that sharing is a single keystroke at the moment I want it.
- **As a security-conscious user**, I want certainty that nothing ever leaves my machine (there's no server to send to), so that I trust the "easy" path as much as the manual one.
- **As a privacy-minded user**, I want the whole flow to be local with no endpoint to configure, so that nothing phones home anywhere.

## 4. UX & flows

### 4.1 First-run / empty state (browser, no session loaded)

```
┌──────────────────────────────────────────────────────────────┐
│  claudepad                                         [ Theme ]  │
│                                                                │
│            Afternoon.  Drop a session to begin.               │  ← serif display (PRD-01)
│                                                                │
│     ┌────────────────────────────────────────────────┐       │
│     │                                                  │       │
│     │     ⬇  Drag a .jsonl here  ·  or paste (⌘V)      │       │
│     │           [ Choose file… ]                       │       │
│     │                                                  │       │
│     └────────────────────────────────────────────────┘       │
│                                                                │
│   ▸ Where are my Claude Code sessions?                        │  ← expandable, OS-aware
│       macOS / Linux:  ~/.claude/projects/<project>/*.jsonl    │
│       Windows:        %USERPROFILE%\.claude\projects\...      │
│       WSL:            \\wsl$\<distro>\home\<you>\.claude\...   │
│       Tip: the newest file is your most recent session.       │
│       [ Copy a one-liner to list recent sessions ]           │
│                                                                │
│   Everything stays on your device until you choose to share.  │  ← trust line, always shown
└──────────────────────────────────────────────────────────────┘
```

- The "Where are my sessions?" section **auto-detects the user's OS** from the user-agent and surfaces the matching path first (others collapsed).
- The **"Copy a one-liner"** button copies a shell snippet that lists the most-recently-modified session files (see FR-7), so a user can find the right one without a file browser.
- The trust line is **always visible** on the empty state and persists as a status affordance after a session loads.

### 4.2 Drop / paste → loaded (local-only by default)

```
 drop file ─┐
 paste     ─┼─► [ Ingest: detect shape, size-check ] ─► PRD-02 parser ─► PRD-03 viewer
 file picker┘                                   │
                                                └─(unrecognized)─► friendly rejection + guidance
```

After a successful load the user is in **local-only** mode (offline, nothing uploaded). A persistent, non-modal banner / action presents the choice point:

```
┌──────────────────────────────────────────────────────────────┐
│  ✓ Loaded "Refactor auth flow" · 142 events · local only      │
│                                   [ Share… ]   [ Clear ]      │
└──────────────────────────────────────────────────────────────┘
```

- **[ Share… ]** routes into the **PRD-06 review-before-share** screen → **PRD-10** (pick recipient by public key) → **PRD-05/PRD-11** encrypt-to-recipient → **blob** (clipboard / `.cpad`). This is the *only* path that produces a share, and it is never automatic. Nothing is transmitted (no server).
- **[ Clear ]** drops the in-memory session (no persistence by default; see FR-18).

### 4.3 Paste-shape detection

On paste (or drop of a non-`.jsonl` text), the ingest layer classifies the payload before handing to PRD-02:

```
paste text ─► trim ─► is it JSON?
                       ├─ parses as 1 object  ──► wrap as single-event-ish → PRD-02
                       ├─ parses as array     ──► treat as event list      → PRD-02
                       ├─ looks like NDJSON    ──► split lines, parse each  → PRD-02
                       └─ not JSON / not session ─► reject with guidance (4.6)
```

### 4.4 CLI flow

```
$ claudepad share ~/.claude/projects/acme/3f2a.jsonl --to steve --tier body+secret
  ⚙  parsing…           142 events
  🔍 scanning secrets…  3 detected  (review below)
  ┌─ Review (✓ keep · ✗ ignore) ───────────────────────┐
  │  ✓ AWS_KEY   ••••••••(20)   line 88                  │
  │  ✓ sk-…      ••••(48)       line 211                 │
  │  ✗ <looks like a UUID, not a secret>                 │
  └────────────────────────────────────────────────────┘
  🔒 encrypting to steve  🤩 🥑 🛸 🐰 🤔 ⚽ 08FE-D363  (AES-256-GCM, client-side)…
  📋 wrote share-for-steve.cpad  ·  copied cp-blob-… to clipboard
     Drop it anywhere - only steve can read it. (No server holds this.)
```

```
$ claude --print "..." | … | claudepad share - --to steve     # stdin pipe
$ claudepad share latest --to steve                            # most recent session
$ claudepad prettify <file>                                    # local-only: print/open, no share
```

`--to` accepts a `cp-pub-…` public key or a saved contact alias (PRD-10). With no `--to`, the CLI errors and lists saved contacts (you can't encrypt-to-recipient without a recipient).

### 4.5 Claude Code slash command flow

```
(inside Claude Code)
> /claudepad-share
  → runs the claudepad CLI against the current session transcript
  → CLI does scan + (optional non-interactive review) + encrypt to the configured default recipient
  → returns the cp-blob-… (and writes a .cpad) for the user to send
```

### 4.6 Friendly rejection (unrecognized input)

```
┌──────────────────────────────────────────────────────────────┐
│  Hmm - that doesn't look like a Claude Code session.          │
│  • Expected a .jsonl file from ~/.claude/projects/…           │
│  • Got: plain text (no JSON lines detected)                    │
│  ▸ Where are my Claude Code sessions?   [ Try again ]         │
└──────────────────────────────────────────────────────────────┘
```

## 5. Functional requirements

Numbered, testable. "Ingest layer" = the client module(s) that acquire bytes and route them; it owns *acquisition*, not parsing.

### Browser: drag-and-drop & file picker
- **FR-1** The empty state SHALL accept a file dropped anywhere on the drop target (and on the full window as a fallback target), showing a visible drag-over affordance, and SHALL load it on drop.
- **FR-2** The empty state SHALL provide a "Choose file…" control that opens the OS file picker filtered to `.jsonl`/`.json`/`.txt`/`.ndjson` (but not *blocking* other extensions - the shape detector, not the extension, decides validity).
- **FR-3** On a successful drop/pick the ingest layer SHALL pass the raw bytes/string to the PRD-02 parser and, on success, render via PRD-03 - **without any network request** (verifiable: zero outbound requests on load).
- **FR-4** Dropping/picking **multiple files** SHALL load the first valid session and surface a non-blocking note that only one session is shown at a time (multi-session UX is out of scope for v1).

### Browser: clipboard paste & shape detection
- **FR-5** A paste (⌘V / Ctrl-V) anywhere on the empty state SHALL be captured and routed through shape detection (4.3) before parsing.
- **FR-6** Shape detection SHALL correctly classify and accept: (a) a single JSON object, (b) a JSON array, (c) NDJSON / multi-line `.jsonl` text, and (d) `.jsonl` file contents; and SHALL **reject** non-session input (plain prose, empty, binary) with the guidance UI in 4.6 - never a stack trace or silent failure. Each case is a unit test (Vitest).

### First-run onboarding / locating sessions
- **FR-7** The empty state SHALL show OS-specific session paths, auto-prioritizing the detected OS:
  - macOS / Linux: `~/.claude/projects/<project-slug>/<session-id>.jsonl`
  - Windows: `%USERPROFILE%\.claude\projects\<project-slug>\<session-id>.jsonl`
  - WSL: `\\wsl$\<distro>\home\<user>\.claude\projects\...`
- **FR-8** The onboarding SHALL provide a copy-to-clipboard "list recent sessions" one-liner per OS, e.g. (POSIX):
  `ls -t ~/.claude/projects/*/*.jsonl | head` - and SHALL explain that the **most-recently-modified** file is the latest session.
- **FR-9** Onboarding copy SHALL state, in plain language, that nothing is uploaded until the user explicitly shares (the trust line), and SHALL remain discoverable after a session is loaded.

### CLI: `claudepad`
- **FR-10** The CLI SHALL provide `claudepad share <file> --to <cp-pub-…> [--tier body|body+secret]` which: parses (PRD-02, shared package) → scans secrets (PRD-06) → encrypts **to the recipient's public key** client-side (PRD-05/PRD-11) → **writes a `.cpad` file (or prints the `cp-blob-…` to stdout)** and nothing sensitive to stderr. **No upload, no link** in v1 (the optional store addon, vNext, may later add a `--store <url>` flag that prints a URL).
- **FR-11** The CLI SHALL support **stdin** via `claudepad share -` (read session from a pipe), enabling `… | claudepad share -`.
- **FR-12** The CLI SHALL provide `claudepad share latest --to <recipient>` resolving the file to the most-recently-modified `~/.claude/projects/**/*.jsonl` (path overridable via `--projects-dir` / config).
- **FR-13** The CLI SHALL provide `claudepad prettify <file>` (alias: `--local`) that performs **local-only** rendering/output (e.g. open in the local web app or emit a self-contained artifact) and makes **zero** network requests.
- **FR-14** The CLI's **identity and contacts** (the sharer's `cp-id` and saved recipient `cp-pub` aliases) and an optional **default recipient** SHALL be configurable via `~/.config/claudepad/config.toml`. There is **no upload endpoint** in v1 - `share` writes a blob locally and never contacts a server. (A vNext `--store <url>` flag for the optional store addon is out of scope; the v1 CLI MUST NOT default to or hardcode any store URL - D-33.)
- **FR-15** When stdout is a TTY, `share` SHALL run an **interactive secret review** (4.4) by default; with `--yes` / non-TTY it SHALL run a **non-interactive** review that keeps all auto-detected secrets redacted (never reveals on the assumption of consent) and prints a summary of what was redacted. `share` always emits the `cp-blob` (to a `.cpad` file and/or stdout); `--out <path>` overrides the file location.

### File size & large-file handling
- **FR-16** The ingest layer SHALL enforce a configurable **soft cap** (default **25 MB** per session) and **hard cap** (default **100 MB**). Above the soft cap, the UI/CLI SHALL warn (and offer to continue) before parsing; above the hard cap it SHALL refuse with guidance to trim/split. (Large `cp-blob` ergonomics - clipboard vs file - are PRD-11 Q-16.)
- **FR-17** Large files SHALL be read **as a stream** where the platform allows (browser `File.stream()` / Node read stream) and parsed line-by-line by PRD-02, so that memory use is bounded and the UI stays responsive (no main-thread freeze > 100 ms; use a worker if needed).
- **FR-18** By default the ingest layer SHALL **not persist** session bytes anywhere (no localStorage/disk cache) beyond the in-memory session; any opt-in local persistence (e.g. "remember last session") SHALL be explicit and clearable, and SHALL never persist secret plaintext.

### Claude Code integration (slash command / Stop-hook)
- **FR-19** claudepad SHALL ship an **installable custom slash command** (`/claudepad-share`) - an installer (`claudepad init claude-code`) writing the command file to `~/.claude/commands/claudepad-share.md` - that invokes the `claudepad` CLI against the current session transcript and returns the encrypted `cp-blob` (encrypting to the configured default recipient).
- **FR-20** claudepad SHALL document and optionally install a **Stop hook** in `~/.claude/settings.json` that, on session stop, runs the CLI on the `transcript_path` provided to the hook (encrypting to the configured default recipient; if none is configured, the hook no-ops with a hint). The Stop hook SHALL be **off by default** and **opt-in** (auto-capturing every stop is surprising and a privacy footgun).
- **FR-21** Both integrations SHALL route through the same redaction + recipient-encryption pipeline as the CLI (FR-10) - **nothing leaves the device, ever** (there is no server) - and SHALL use the local identity/contacts config (FR-14).
- **FR-22** The installer SHALL be **idempotent** and **reversible** (`claudepad init claude-code --uninstall` removes the command file and any hook block it added), and SHALL never silently overwrite a user's existing command/hook of the same name (prompt/merge).

### The local-vs-share choice point (cross-cuts all surfaces)
- **FR-23** Every ingest surface SHALL default to **local-only** and require a distinct, explicit user action (with a chosen recipient) to produce a share. No surface SHALL encrypt/emit a blob as a side effect of loading.
- **FR-24** The share action SHALL always route through the **PRD-06 review-before-share** step before any bytes are encrypted into a blob (review is mandatory and non-skippable per D-5); the CLI's `--yes` path satisfies this by running the non-interactive review (FR-15), not by skipping it.

## 6. Technical design

### 6.1 Module layout (monorepo, per _context.md §3)

```
packages/
  shared/        # normalized Session types + parse/scan/encrypt contracts (PRD-02/05/06 own internals)
  ingest/        # THIS PRD: acquisition + shape-detection + routing (browser + node entry points)
    detect.ts        # classify(payload) -> 'jsonl' | 'json-object' | 'json-array' | 'ndjson' | 'unknown'
    read-browser.ts  # File/Blob/stream + clipboard handlers
    read-node.ts     # fs streams, stdin, `latest` resolver, projects-dir scan
    limits.ts        # soft/hard cap policy (FR-16)
    onboarding.ts    # OS detection + path strings + one-liners (FR-7/8)
  client/        # PRD-01/03 web app; consumes ingest browser entry
  cli/           # `claudepad` bin; consumes ingest node entry + shared scan/encrypt (PRD-05/10/11)
    init.ts          # claude-code installer (slash command + optional hook)
```

The **shape detector** and **OS/path/onboarding** helpers are pure functions in `packages/ingest` → easy to unit-test and shared between browser and CLI. Parsing, scanning, and crypto are **dependencies**, not implementations, here.

### 6.2 Browser ingest

- Single delegated drop handler on the app root (prevent default navigation), plus a scoped drop target for the affordance. Window-level `paste` listener gated to the empty/loaded-but-not-editing state.
- Read via `File.text()` for small files; `File.stream()` + a `TextDecoderStream` + line splitter for files over a streaming threshold (≈2 MB) to keep memory bounded (FR-17). Heavy parsing offloaded to a Web Worker if it would block > 100 ms.
- OS detection via `navigator.userAgentData`/UA string, best-effort; all OS paths remain visible behind a disclosure (FR-7).

### 6.3 CLI design

- **Runtime:** Node (ships as an npm package `claudepad`, `bin: claudepad`). Reuses `packages/ingest/read-node.ts` and the shared parse/scan/encrypt code so behavior is identical to the browser. Web Crypto via Node's `crypto.webcrypto.subtle` - **same AES-256-GCM / ECDH-P256 primitives** as the browser, no second crypto implementation (per _context.md §3 / §5).
- **Commands:** `share <file|-> --to <recipient> [--tier]`, `share latest --to <recipient>`, `prettify <file>`, `id` (mint/import/export identity, manage contacts - PRD-10), `init claude-code [--uninstall]`, `config`. Flags: `--yes`, `--out <path>`, `--projects-dir`. No `--endpoint`/`--expiry`/`--burn` in v1 (no server).
- **`latest` resolver:** stat all `*/*.jsonl` under the projects dir, pick max mtime. Cheap, no parsing.
- **Output discipline:** human progress to stderr while running, the final `cp-blob` to **stdout** (so `$(claudepad share latest --to steve)` captures just the blob) plus a `.cpad` file; never print decrypted secret values or keys to logs.

### 6.4 Claude Code integration - both options, with a recommendation

**Option A - Custom slash command (`~/.claude/commands/claudepad-share.md`).** User-invoked, predictable, explicit. Installed file:

```markdown
---
description: Encrypt the current Claude Code session for a recipient via claudepad
allowed-tools: Bash(claudepad share *)
---
Run the claudepad CLI to capture, redact, and encrypt the current session for
the configured default recipient.

Execute: `claudepad share latest --yes` and report back the resulting
`cp-blob-…` (and the `.cpad` file path) verbatim. Do not print or echo any
secret values. If `claudepad` is not installed, tell the user to run
`npm i -g claudepad` (or point at the docs).
```

> Note: a slash command runs *as a prompt to Claude*; it asks Claude to invoke the CLI. `share latest` (most-recent session) is the robust target since the command does not itself receive a transcript path. The recipient comes from the CLI's configured default (FR-14); the blob is produced locally - nothing is uploaded.

**Option B - Stop hook (`~/.claude/settings.json`).** Fires automatically when Claude finishes. Receives JSON on stdin including `transcript_path`. Installed block (opt-in, FR-20):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "claudepad share \"$(jq -r .transcript_path)\" --yes --quiet || true   # encrypts to the configured default recipient; writes a .cpad
          }
        ]
      }
    ]
  }
}
```

> The hook reads `transcript_path` from the hook's stdin JSON, so it captures the exact session. It must exit 0 (`|| true`) and never block the stop (no exit 2), and stay quiet by default. Auto-firing on *every* stop is a privacy footgun and over-produces blobs - hence **off by default**.

**Recommendation for v1 (resolves Q-6):** ship the **CLI + the custom slash command** as the supported one-keystroke path; **document** the Stop-hook and provide the optional installer for it, but keep it **opt-in and off by default**. Rationale: the slash command is explicit and user-initiated (matches D-5 "never auto-share silently" in spirit, and the "easy but deliberate" promise), while a default Stop-hook would produce a blob on every stop, which is surprising. Power users who want full automation (and have a configured default recipient) can enable the hook knowingly.

### 6.5 Trade-offs
- **Streaming vs. simplicity:** full-file `.text()` is simpler but blows memory on huge sessions; we stream above a threshold (FR-17) and accept the added code.
- **Slash command targets `latest` vs. exact session:** the command can't see a transcript path, so `latest` is a small correctness compromise vs. the hook's exact `transcript_path`. Documented; the hook path is exact for users who opt in.
- **CLI re-uses browser crypto vs. a native lib:** re-using Web Crypto keeps a *single* audited primitive (no divergent CLI crypto), at the cost of depending on Node's `webcrypto`.
- **Recipient required:** trustless sharing can't encrypt without a recipient public key, so one-keystroke paths depend on a configured default recipient / contact (PRD-10). This is inherent to the model, not a wart.

## 7. Data model / API

This PRD introduces **no new wire format**. It produces, as output of acquisition, the **raw session payload** (string/stream) consumed by PRD-02, and it *invokes* the recipient-wrapped `cp-blob` owned by PRD-05/PRD-11. Internal contracts only:

```ts
// packages/ingest
type IngestShape = 'jsonl' | 'json-object' | 'json-array' | 'ndjson' | 'unknown';

interface IngestResult {
  shape: IngestShape;
  raw: string;                 // normalized to text for PRD-02; streaming variant yields chunks
  bytes: number;
  source: 'drop' | 'paste' | 'file-picker' | 'cli-file' | 'cli-stdin' | 'cli-latest' | 'hook';
  overSoftCap: boolean;
  overHardCap: boolean;
}

function classify(payload: string): IngestShape;          // pure, unit-tested (FR-6)
function resolveLatest(projectsDir: string): string;       // CLI `latest` (FR-12)
function onboardingPaths(os: 'mac'|'linux'|'win'|'wsl'): { path: string; listOneLiner: string }; // FR-7/8
```

CLI config (FR-14):
```toml
# ~/.config/claudepad/config.toml
identity      = "cp-id-…"            # the sharer's identity secret (PRD-10); or a keychain ref
default-to    = "steve"              # optional default recipient for one-keystroke share
projects-dir  = "~/.claude/projects" # override default scan root

[contacts]                           # saved recipient public keys + aliases (PRD-10)
steve = "cp-pub-…"
```
No upload endpoint in v1 (no server). The `cp-blob` format is **defined in PRD-11**; identities/contacts in **PRD-10**; crypto in **PRD-05**.

## 8. Security & privacy

Conforms to [`_context.md` §5](./_context.md) and [`../TRUSTLESS-MODEL.md`](../TRUSTLESS-MODEL.md):

- **Nothing leaves the device, ever (§5.1).** There is no server. Every sharing surface (web Share, CLI `share`, slash command, hook) performs **client-side** secret scanning (PRD-06) + recipient-encryption (PRD-05/PRD-11) and emits a blob the user carries. The ingest layer has no network code path at all. **Acceptance-verifiable:** a network capture during `share` shows zero egress.
- **Review-before-share is mandatory (§5.4, D-5).** All share paths route through PRD-06 review (FR-24). The CLI `--yes`/non-TTY path does **not** skip review - it runs a non-interactive review that **keeps detections redacted** and never auto-reveals (FR-15), so the worst case is *more* redaction, never an accidental reveal.
- **Local-only is the default (§5.1, D-1/D-20).** Loading a session makes zero network requests (FR-3, FR-13). Nothing is persisted by default (FR-18).
- **Stop-hook is opt-in and off by default (FR-20).** Auto-capturing every session is treated as a privacy risk, not a convenience to default-on.
- **No secrets in logs/clipboard.** CLI prints the (encrypted) blob to stdout, never decrypted secret values or keys to logs/stderr (FR-10, §6.3). Onboarding one-liners only *list* files; they never read or transmit contents.
- **Recipient verification (PRD-10).** When a recipient is given by `cp-pub`/alias, the CLI/UI surface the recipient fingerprint (§4.4) so the user confirms who they're encrypting to.
- **Risks introduced by this PRD & mitigations:**
  - *Risk:* a default Stop-hook would over-produce blobs. *Mitigation:* off by default, opt-in installer, documented footgun (FR-20).
  - *Risk:* `claudepad share latest` could grab the *wrong* (e.g. unrelated, secret-heavy) session. *Mitigation:* `share` prints session title/event count/mtime and the redaction summary before emitting; review step still gates it.
  - *Risk:* the installer mangling a user's `settings.json`/commands. *Mitigation:* idempotent, reversible, never silently overwrite (FR-22).
  - *Risk:* pasted text containing secrets lingering in browser clipboard/history. *Mitigation:* inherited - no persistence (FR-18); best-effort-redaction caveats remain owned by PRD-06 and TRUSTLESS-MODEL §7.

## 9. Dependencies

- **Upstream (consumed):**
  - **PRD-01** (Design System) - empty-state, drop target, banner, CLI-link presentation styling.
  - **PRD-02** (Parser) - ingest hands raw payload/stream to the parser; PRD-02 owns shape *normalization* and tolerance. Ingest only *classifies* shape to route.
- **Downstream (invoked / handed off to):**
  - **PRD-03** (Viewer) - local-only render target after a successful load.
  - **PRD-06** (Secret Detection & Review) - mandatory review step every share path enters.
  - **PRD-10** (Identity) - the sharer's identity + recipient public keys/contacts the CLI/UI use.
  - **PRD-05/PRD-11** (Crypto / Trustless Sharing) - recipient-encryption + the `cp-blob`; CLI and web Share call into them.
  - **PRD-09** (Self-host/Launch) - packaging of the `claudepad` npm bin and the `init claude-code` installer (static client; no endpoint).

## 10. Acceptance criteria / DoD

- [ ] Dropping a `.jsonl` (or using the file picker) renders the session via PRD-03 with **zero network requests** (FR-1–3).
- [ ] Pasting each of: a JSON object, a JSON array, NDJSON, and `.jsonl` text loads correctly; pasting prose/empty/binary shows the friendly rejection (FR-5, FR-6) - covered by Vitest `classify()` cases and a Playwright paste test.
- [ ] Empty state shows OS-correct session paths (auto-prioritized) and a working "list recent sessions" copy button (FR-7, FR-8); the trust line is present (FR-9).
- [ ] `claudepad share <file> --to <r>`, `share - --to <r>` (pipe), and `share latest --to <r>` each produce a `cp-blob` (stdout + `.cpad`) after a client-side scan+encrypt; a network capture shows **zero egress** (FR-10–12; ROADMAP §6).
- [ ] `claudepad prettify <file>` makes zero network requests (FR-13).
- [ ] `share` with no `--to` and no configured default recipient errors and lists saved contacts (FR-14).
- [ ] `--yes`/non-TTY review keeps detections redacted and never auto-reveals; `--out` controls the `.cpad` location (FR-15).
- [ ] Soft/hard cap behavior (warn / refuse) verified at boundary sizes; large file (> streaming threshold) loads without freezing the UI > 100 ms (FR-16, FR-17).
- [ ] No session bytes persisted by default (verify storage empty after load) (FR-18).
- [ ] `claudepad init claude-code` installs `/claudepad-share`; `--uninstall` cleanly removes it; re-running is idempotent and never clobbers an existing command/hook (FR-19, FR-22).
- [ ] Stop-hook installer is opt-in/off-by-default and, when enabled, captures the exact `transcript_path` and exits 0 without blocking stop (FR-20).
- [ ] Every share surface routes through the PRD-06 review step; no surface produces/emits a blob as a side effect of loading (FR-23, FR-24).
- [ ] Time-to-prettify from drop is well under 15s on a representative session (ROADMAP §6).

## 11. Open questions

- **Q-6 (this PRD's headline; recommendation provided, needs sign-off):** Which one-keystroke Claude Code path ships in v1? **Recommendation: ship CLI + custom slash command; document + optionally install the Stop-hook as opt-in/off-by-default** (§6.4). Pending product owner confirmation.
- **Q-4a (defaults; coordinate with PRD-06):** For the CLI/slash non-interactive (`--yes`) path, is "keep all auto-detections redacted, never auto-reveal" the right default? (This PRD assumes yes - fail safe.)
- **OQ-A (file-size caps):** Are 25 MB soft / 100 MB hard the right defaults for local handling? (No backend limit to derive from in v1; large-blob clipboard/file ergonomics are PRD-11 Q-16.)
- **OQ-B (slash command target):** Accept that the slash command targets `latest` (most-recent) rather than the exact in-flight session, since a slash command can't receive a transcript path? The Stop-hook covers the exact-session case for opt-in users (§6.5).
- **OQ-C (CLI distribution):** Single npm `claudepad` bin for v1, or also a standalone/Homebrew binary? (Defer detailed packaging to PRD-09; v1 leans npm bin.)
- **OQ-D (local-persistence opt-in):** Do we offer a "remember last session" local cache at all in v1, or keep strictly in-memory? (FR-18 defaults to in-memory; opt-in deferred.)
- **OQ-E (default recipient):** one-keystroke paths need a configured default recipient. Confirm the config shape (`default-to` + `[contacts]`, FR-14) and whether the first run prompts to set one.

## 12. Phase / milestone

**Phase P1 - Local Prettify (MVP-0)**, per [ROADMAP §3](../ROADMAP.md). The drag-drop / paste / first-run-onboarding / `prettify` portions are pure P1 (offline, no server) and complete the MVP-0 story alongside PRD-03. The **share-routing** portions of the CLI, slash command, and Stop-hook are the **bridge into P3 (Trustless Sharing)** and become fully functional once PRD-10 (identity) and PRD-05/PRD-11 (crypto + recipient sharing) land - but the surfaces and the review-gated routing are specified here so P3 is a wiring exercise, not a redesign. Build-order position: **PRD-04** follows PRD-03, precedes PRD-10/PRD-11 ([ROADMAP §3 critical path](../ROADMAP.md)).
