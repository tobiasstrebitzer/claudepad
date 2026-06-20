# PRD-02 - Session Parser & Normalized Schema

> **Phase:** P0 (Foundation) · **Status:** Draft · **Owner PRD for:** the shared normalized `Session` type spec
> Read [`_context.md`](./_context.md) first - it is canonical. This PRD **owns and finalizes** the normalized session model sketched in `_context.md` §6 and the shared types package consumed by the viewer (PRD-03), ingest (PRD-04), crypto (PRD-05), secrets (PRD-06), and playback (PRD-08).

---

## 1. Summary & problem

claudepad's entire value chain - prettified rendering, secret redaction, encryption, and playback - operates on a single in-memory data structure, **not** on raw Claude Code JSONL. PRD-02 builds the tolerant ingest core that converts a raw Claude Code session file (`~/.claude/projects/*.jsonl`), or a pasted clipboard fragment, into a normalized, source-agnostic `Session` model. The Claude Code JSONL format is **undocumented, versioned, and changes between releases** (this PRD's fixtures already span 15 versions, `2.1.140`–`2.1.183`, with event kinds not present in earlier indicative specs). The parser must therefore treat the input as adversarial and evolving: it must never throw while rendering, must preserve unknown fields rather than drop them, and must degrade gracefully when it meets a shape it has never seen. This is the single highest-leverage resilience component in the product - every downstream PRD assumes "the `Session` is always valid and renderable."

## 2. Goals / Non-goals

### Goals
- Define the **authoritative** TypeScript types for `Session`, `SessionEvent`, and `ContentBlock` in a shared package (`@claudepad/schema`) consumed by client, CLI, and tests.
- Parse Claude Code `*.jsonl` (one JSON object per line) and pasted single-message / clipboard variants into that model.
- **Never crash rendering.** Malformed lines, partial files, unknown event types, and unknown content blocks degrade to a preserved-but-renderable representation (`raw` / `meta`).
- Detect source + best-effort `formatVersion`; record what could not be understood so the UI can surface "parsed with caveats."
- Produce a **deterministic, total ordering** of events with normalized timestamps (load-bearing for PRD-08 playback).
- Ship a **fixture corpus** across format versions and a Vitest strategy that locks in resilience and prevents regressions.
- Keep the design **source-agnostic** so adding Codex/Gemini/Cursor later is a new adapter, not a schema rewrite (per D-12, vNext).

### Non-goals
- **Multi-source ingest.** Only the Claude Code adapter ships in v1 (D-12). The schema is source-agnostic; the parsers are not all built.
- **Rendering.** How a `text` / `code` / `tool_use` block looks is PRD-03. This PRD only guarantees the data is present and well-shaped.
- **Secret detection / redaction.** PRD-06 consumes the model; PRD-02 does **not** redact (it must preserve plaintext faithfully so PRD-06 can scan it).
- **Encryption / upload.** PRD-05.
- **File acquisition UX** (drag-drop, paste UI, CLI capture). PRD-04 calls into this parser; PRD-02 exposes the function, not the UI.
- **Lossless round-trip** back to original JSONL. We preserve unknown fields for fidelity and debugging, but re-serializing to byte-identical Claude Code JSONL is explicitly out of scope.

## 3. Personas & user stories

- **As the Sharer (via the viewer/CLI), I want** my session to render even if I'm on a newer Claude Code build than claudepad has seen, **so that** I'm never blocked by a format bump.
- **As a downstream developer (PRD-03/06/08), I want** one stable, well-typed `Session` shape, **so that** I never touch raw JSONL or write defensive `any`-guards in feature code.
- **As the Self-hoster, I want** the parser to run fully client-side with no network calls, **so that** zero-knowledge holds (the file never leaves the browser/CLI to be understood).
- **As a maintainer, I want** a versioned fixture corpus and tests, **so that** when Claude Code ships `2.2.x` I can drop a new fixture, see exactly what broke, and fix it without regressing older formats.
- **As the Low-priv / High-priv viewer (PRD-06), I want** unknown blocks preserved as opaque `raw` values, **so that** secrets hiding in fields the parser didn't model are still visible to PRD-06's scanner rather than silently dropped.

## 4. UX & flows

PRD-02 is a library, but it has two user-visible contracts: **a result envelope** (so the UI can show "parsed with N warnings") and **never a thrown error mid-render**.

### 4.1 Parse pipeline (conceptual)

```
 raw input (File | string | Blob)
        │
        ▼
 ┌──────────────────────┐
 │ 1. Detect input form │  jsonl-file | clipboard-fragment | single-json | unknown-text
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 2. Tokenize lines    │  split NDJSON; tolerate trailing/blank/partial last line
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 3. Per-line JSON.parse│ on failure → DiagnosticRecord(kind:'unparseable-line'), keep going
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 4. Detect source +   │  claude-code (default v1); best-effort formatVersion from `version`
 │    formatVersion     │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 5. Adapter: map each │  claude-code adapter → SessionEvent | dropped-to-meta
 │    record → event(s) │  unknown block → {type:'raw'}; unknown event → {kind:'meta'}
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 6. Order + normalize │  DAG (parentUuid) → fallback timestamp → fallback file order
 │    timestamps (ISO)  │
 └──────────┬───────────┘
            ▼
 ParseResult { session, diagnostics[], stats }
```

### 4.2 The "parsed with caveats" contract

The parser **always returns** a `ParseResult`. It never rejects/throws for content reasons (only for truly unusable input like an empty string, which still returns an empty `Session` + a diagnostic). The UI (PRD-03/04) reads `result.diagnostics` to optionally show a non-blocking banner:

```
 ┌───────────────────────────────────────────────────────────┐
 │ ⚠  Parsed with 3 notes - newer Claude Code format (2.1.183) │
 │    2 unknown blocks preserved · 1 line could not be read    │   [Details ▾]
 └───────────────────────────────────────────────────────────┘
```

This is the resilience story made visible: honesty over silent failure, mirroring `_context.md` §5.4's "surfaced, never hidden" principle for redaction.

## 5. Functional requirements

Numbered, testable. Each maps to at least one fixture/Vitest case (§10, §6.6).

### Input handling & tolerance
- **FR-1** The parser MUST accept input as `File`, `Blob`, `ArrayBuffer`, or `string` and decode bytes as UTF-8 (stripping a leading BOM if present).
- **FR-2** The parser MUST split JSONL on `\n`, tolerating `\r\n`, blank lines, leading/trailing whitespace, and a **truncated final line** (incomplete JSON at EOF) without throwing.
- **FR-3** A line that fails `JSON.parse` MUST NOT abort parsing; it MUST emit a `DiagnosticRecord { kind: 'unparseable-line', line, snippet }` and be skipped (or preserved as a `meta` event when `preserveUnparseable` is set; see FR-21).
- **FR-4** The parser MUST detect the **input form**: `jsonl` (≥1 valid object lines), `single-json` (a single JSON object/array, e.g. one pasted message), `clipboard-fragment` (newline-joined human-pasted text that is not valid JSON), or `unknown`. Form detection MUST be heuristic and side-effect-free.
- **FR-5** For `clipboard-fragment` / non-JSON text, the parser MUST still return a valid `Session` containing the text as a single `user` event with a `text` block, plus a diagnostic noting low-confidence interpretation. (Supports PRD-04 paste.)
- **FR-6** An empty or whitespace-only input MUST return a valid, empty `Session` (zero events) plus a diagnostic - never an exception.

### Source & version detection
- **FR-7** The parser MUST set `session.source` (v1: always `'claude-code'`) via a detector. Detection MUST be based on structural signals (presence of `sessionId`, `uuid`, `parentUuid`, Anthropic `message.role`/`content` shapes), **not** filename.
- **FR-8** The parser MUST populate `session.formatVersion` best-effort from the `version` field of any record (e.g. `"2.1.177"`), falling back to `'unknown'`. When records disagree, it MUST use the most frequent value and emit a `version-mismatch` diagnostic.
- **FR-9** When the detected `formatVersion` is **newer than the highest version the adapter was authored against**, the parser MUST still parse and MUST emit a `newer-format` diagnostic (informational, non-blocking).

### Event mapping (Claude Code → normalized)
- **FR-10** The parser MUST map a Claude Code `type: "user"` record to a `user` event, and `type: "assistant"` to an `assistant` event (carrying `model` from `message.model`).
- **FR-11** Assistant `content` blocks MUST be mapped: Anthropic `text` → `ContentBlock{type:'text'}`; `thinking` (and `redacted_thinking`) → a `thinking` **event** (FR-13); `tool_use` → a `tool_use` **event** (FR-14); `image` → `ContentBlock{type:'image'}` (FR-15).
- **FR-12** A `message.content` that is a **bare string** (older/user records) MUST be normalized to a single `text` ContentBlock. A `content` array MUST map block-by-block.
- **FR-13** A `thinking` block MUST become a `thinking` event; the cryptographic `signature` field MUST be preserved (in `raw`) but is NOT rendered content. `redacted_thinking` MUST become a `thinking` event flagged `redacted: true` with no plaintext.
- **FR-14** A `tool_use` block MUST become a `tool_use` event with `id` (the `toolu_…` id, preserved for correlation), `name`, and `input` (passed through as `unknown`, never coerced).
- **FR-15** An `image` block MUST become a `ContentBlock{type:'image'}` capturing its source: base64 (`source.type:'base64'`, with `mediaType`) or URL/file ref. Image **bytes MUST be preserved by reference** (kept as `raw` payload), not decoded or re-encoded by the parser.
- **FR-16** A `tool_result` (appearing inside a `user` record's `content` array, and/or mirrored in the top-level `toolUseResult`) MUST become a `tool_result` event with `tool_use_id`/`forName` correlation, `output`, and `isError` (from `is_error`). When both the inline block and `toolUseResult` are present, the parser MUST prefer the richer payload and preserve the other in `raw`.
- **FR-17** A `user` record whose `content` array contains **only** `tool_result` blocks (a tool-turn, not human input) MUST NOT be rendered as a human "user" message; it MUST emit `tool_result` event(s) only. (Prevents PRD-03 from drawing empty user bubbles.)
- **FR-18** `type: "system"` records (e.g. `subtype: "turn_duration"`) MUST map to `meta` events carrying `subtype` and salient fields (`durationMs`, `messageCount`) in `raw`; they are non-conversational metadata.
- **FR-19** Records with `isMeta: true` MUST be flagged on the resulting event (`meta` flag) so PRD-03 can de-emphasize/collapse them.
- **FR-20** Session-scoped metadata records - `ai-title` (→ `meta.title`), `mode`, `permission-mode`, `last-prompt`, `file-history-snapshot`, `attachment`, `queue-operation`, `bridge-session`, `pr-link`, and the legacy `summary` line - MUST be recognized: title/cwd/model/startedAt are lifted into `session.meta`; the remainder become `meta` events (or are folded into session meta) **without** appearing as conversation turns. Each unmapped-but-recognized type MUST round-trip its raw record into the event's `raw`.

### Unknown-field preservation (the resilience core)
- **FR-21** Any record with an **unrecognized `type`** MUST become a `meta` event with `note` set to the type and the entire original record preserved in `raw`. The parser MUST NOT drop it. (Addresses ROADMAP risk: "format is undocumented & changes.")
- **FR-22** Any **unrecognized content block `type`** MUST become a `ContentBlock{type:'raw', value: <original block>}`. PRD-03 renders it as a collapsed "unknown block" rather than failing.
- **FR-23** Every event MUST retain its source `uuid` (when present) as `event.id`, and the original record MUST be retrievable via `event.raw` (kept by default; strippable via option for payload size - see FR-30).
- **FR-24** The parser MUST never let a single bad event corrupt others: mapping is per-record and wrapped so a thrown adapter error becomes a `meta` event + `adapter-error` diagnostic, not a top-level crash.

### Ordering & timestamp normalization (for PRD-08)
- **FR-25** The parser MUST produce a **total order** over events using this precedence: (1) the `parentUuid → uuid` DAG topologically sorted; (2) `timestamp` ascending where the DAG is ambiguous or absent; (3) original file/line order as the final tiebreaker. Ordering MUST be deterministic for identical input.
- **FR-26** All event timestamps MUST be normalized to **ISO-8601 UTC strings** (`event.ts`). Inputs already ISO are validated; missing/invalid timestamps yield `ts: undefined` (never `Invalid Date`) plus a `missing-timestamp` diagnostic count. The parser MUST NOT invent timestamps.
- **FR-27** The parser MUST expose, on `session.meta`, `startedAt` (earliest valid `ts`) and SHOULD expose `endedAt` (latest), to seed PRD-08's timeline without a second pass.
- **FR-28** **Sidechain / sub-agent** records (`isSidechain: true`, or events forming a separate `parentUuid` tree) MUST be tagged `event.lane` (e.g. `'main'` | `'sidechain:<id>'`) so PRD-03/08 can group or collapse sub-agent activity while keeping a single ordered stream.

### Packaging & API
- **FR-29** The normalized types and `parseSession()` MUST live in a standalone package `@claudepad/schema` with **zero runtime dependencies on React, DOM, or Node-only APIs**, so it runs identically in browser, CLI, and Vitest.
- **FR-30** `parseSession(input, options?)` MUST be the single public entry point and MUST be **pure** (no I/O, no globals beyond `TextDecoder`). Options: `{ preserveRaw?: boolean; preserveUnparseable?: boolean; source?: 'auto' | 'claude-code'; maxBytes?: number }`. Default `preserveRaw: true`.
- **FR-31** The package MUST export a stable `SCHEMA_VERSION` constant; the parser stamps `result.schemaVersion` so downstream caches can invalidate on schema changes.

## 6. Technical design

### 6.1 Module layout

```
packages/schema/                      → @claudepad/schema (zero-dep, isomorphic)
  src/
    types.ts          // Session, SessionEvent, ContentBlock, ParseResult (authoritative)
    parse.ts          // parseSession() orchestration: detect → tokenize → adapt → order
    detect.ts         // input-form + source + formatVersion detection
    tokenize.ts       // NDJSON splitter, tolerant of partial/blank/CRLF
    order.ts          // DAG topo-sort + timestamp + file-order tiebreak
    time.ts           // ISO normalization helpers
    diagnostics.ts    // DiagnosticRecord builders, stats accumulation
    adapters/
      claude-code/
        index.ts      // record → SessionEvent(s)
        events.ts     // user/assistant/system/meta record mappers
        content.ts    // content-block mappers (text/thinking/tool_use/image/raw)
        version.ts    // known version range + capability table
    index.ts          // public surface: parseSession, types, SCHEMA_VERSION
  test/
    fixtures/         // see §6.6 / §10
    *.test.ts
```

### 6.2 Adapter pattern (source-agnostic, D-12)

`parseSession` selects an **adapter** by source. v1 registers exactly one: `claudeCodeAdapter`. An adapter's contract:

```ts
interface SourceAdapter {
  id: SessionSource;                 // 'claude-code'
  detect(records: RawRecord[]): number;          // 0..1 confidence
  detectVersion(records: RawRecord[]): string;   // best-effort
  mapRecord(rec: RawRecord, ctx: AdapterCtx): MapOutput;  // → events + diagnostics
  liftMeta(records: RawRecord[]): Partial<SessionMeta>;   // title/cwd/model/startedAt
}
```

Adding Codex/Gemini later = a new adapter file + fixtures; **no change** to `types.ts`, `order.ts`, or any downstream PRD. This is the concrete payoff of "source-agnostic."

### 6.3 Tolerance strategy - three layers

1. **Lexical** (`tokenize.ts`): never assume well-formed NDJSON. Partial last line, blank lines, `\r\n`, stray prose → handled.
2. **Structural** (`detect.ts` + adapter): unknown `type` → `meta`+`raw`; unknown block → `raw`; missing fields → optional/undefined, not error.
3. **Defensive execution** (`parse.ts`): every `mapRecord` call is wrapped in `try/catch`; a throw becomes a diagnostic + `meta` event (FR-24). One poisoned record can never blank the page.

The non-negotiable invariant, asserted by a property test (§10): **for any byte sequence, `parseSession` returns a `ParseResult` and never throws.**

### 6.4 Why a normalized DAG-aware ordering

Claude Code records form a `parentUuid → uuid` linked structure (verified: `parentUuid: null` at root, each subsequent record points back). Pure timestamp sort is insufficient because (a) some records (e.g. `mode`, `ai-title`) carry no timestamp, and (b) streamed assistant chunks can share a millisecond. We topo-sort the DAG and use timestamp + file order only to break ties (FR-25). This gives PRD-08 a faithful causal order and a stable scrubber.

### 6.5 Trade-offs & decisions
- **Keep `raw` by default (FR-30).** Costs memory on huge sessions but is the safety net for unknown formats and the *only* place PRD-06 can find secrets hiding in unmodeled fields. `preserveRaw:false` is offered for the share/upload path once PRD-06 has scanned (so ciphertext stays lean). Trade-off: fidelity vs. payload - defaulted to fidelity.
- **`thinking` as its own event kind, not a ContentBlock.** Matches `_context.md` §6 and lets PRD-03/PRD-08 collapse/skip reasoning independently; the cost is splitting one assistant record into multiple events (handled in §6.1 `events.ts`).
- **No streaming/incremental parse in v1.** Sessions are read whole (largest observed are a few MB; `maxBytes` guard included). Streaming is a vNext optimization for very large sessions.
- **Detection by structure, not filename (FR-7).** Pasted fragments have no filename; structure-based detection works for both file and clipboard paths (PRD-04).

### 6.6 Fixture corpus & Vitest strategy (resilience)

Directly answers ROADMAP risk *"Claude Code JSONL format is undocumented & changes."*

- **Versioned real-world fixtures:** redacted real sessions across observed versions (corpus already spans `2.1.140`–`2.1.183`). Each fixture is committed with a `meta.json` recording its `version`, expected event count, and expected event-kind histogram (a **golden snapshot**). A new Claude Code release = drop a new fixture; the snapshot test pinpoints exactly what changed.
- **Synthetic adversarial fixtures:** truncated last line; invalid JSON line mid-file; empty file; BOM-prefixed; `\r\n`; unknown `type`; unknown content block; `content` as string vs array; `tool_result`-only user turn; missing timestamps; out-of-order timestamps; duplicate `uuid`; deeply nested `input`; image block (base64 + url); a 5 MB stress file.
- **Tests:**
  - *Golden snapshots* per version fixture (event count, kinds, order, lifted meta).
  - *Property test* (`fast-check`): random bytes / mutated valid JSONL → `parseSession` never throws and always returns a `ParseResult` (the FR-24/§6.3 invariant).
  - *Round-trip-of-fidelity* test: every input record is accounted for (mapped to an event or a diagnostic; nothing silently vanished) - `mappedRecords + droppedToDiagnostics === totalRecords`.
  - *Ordering* test: deterministic order; DAG-then-timestamp precedence; sidechain laning.
  - *Coverage gate:* `parse.ts`, `order.ts`, `adapters/claude-code/**` held to a high line/branch threshold in CI.
- **CI hook:** a lightweight script can scan a developer's local `~/.claude/projects` (opt-in, never committed) to flag unseen `type`/block values, prompting a fixture addition before they hit users.

## 7. Data model / API

This section is the **authoritative finalization** of `_context.md` §6. Where it expands the indicative spec, **this PRD wins** (and `_context.md` §6 should be updated to point here).

### 7.1 Core types

```ts
// @claudepad/schema - types.ts

export const SCHEMA_VERSION = '1' as const;

export type SessionSource = 'claude-code'; // extensible union; v1 = claude-code only (D-12)

export interface Session {
  /** Stable id: source sessionId when available, else a content hash. */
  id: string;
  source: SessionSource;
  /** Best-effort detected source format version, e.g. "2.1.177" | "unknown". */
  formatVersion: string;
  meta: SessionMeta;
  /** Fully ordered, timestamp-normalized event stream (see ordering FR-25..28). */
  events: SessionEvent[];
}

export interface SessionMeta {
  title?: string;        // from ai-title / first user line
  cwd?: string;          // working directory
  gitBranch?: string;
  startedAt?: string;    // ISO-8601 UTC, earliest event ts
  endedAt?: string;      // ISO-8601 UTC, latest event ts
  model?: string;        // dominant assistant model
  entrypoint?: string;   // e.g. "cli"
  /** Anything lifted but not modeled above, preserved. */
  raw?: Record<string, unknown>;
}

/** Discriminated union on `kind`. Every variant shares EventBase. */
export type SessionEvent =
  | UserEvent
  | AssistantEvent
  | ThinkingEvent
  | ToolUseEvent
  | ToolResultEvent
  | MetaEvent;

export interface EventBase {
  /** Source uuid when present; else synthesized stable id (FR-23). */
  id?: string;
  /** Parent uuid for DAG reconstruction; null/undefined at root. */
  parentId?: string | null;
  /** ISO-8601 UTC, or undefined when source had no/invalid timestamp (FR-26). */
  ts?: string;
  /** 'main' | 'sidechain:<id>' - sub-agent laning (FR-28). */
  lane?: string;
  /** True when source flagged isMeta (de-emphasize in UI) (FR-19). */
  meta?: boolean;
  /** Original source record, preserved unless preserveRaw:false (FR-23, FR-30). */
  raw?: unknown;
}

export interface UserEvent      extends EventBase { kind: 'user';      content: ContentBlock[] }
export interface AssistantEvent extends EventBase { kind: 'assistant'; model?: string; content: ContentBlock[] }
export interface ThinkingEvent  extends EventBase { kind: 'thinking';  content: ContentBlock[]; redacted?: boolean }
export interface ToolUseEvent   extends EventBase { kind: 'tool_use';  toolId?: string; name: string; input: unknown }
export interface ToolResultEvent extends EventBase {
  kind: 'tool_result';
  /** Correlates to ToolUseEvent.toolId (Anthropic tool_use_id). */
  forToolId?: string;
  forName?: string;
  output: unknown;
  isError?: boolean;
}
/** Anything unrecognized or non-conversational, preserved (FR-18, FR-20, FR-21). */
export interface MetaEvent extends EventBase { kind: 'meta'; note: string; subtype?: string }

export type ContentBlock =
  | { type: 'text';  text: string }
  | { type: 'code';  lang?: string; text: string }   // parser MAY promote fenced text → code; else stays text
  | { type: 'image'; ref: string; mediaType?: string; encoding?: 'base64' | 'url' | 'file' }
  | { type: 'raw';   value: unknown };               // unknown blocks degrade gracefully, never crash (FR-22)
```

### 7.2 Parse result envelope

```ts
export interface ParseResult {
  schemaVersion: typeof SCHEMA_VERSION;
  session: Session;
  diagnostics: DiagnosticRecord[];
  stats: ParseStats;
}

export type DiagnosticKind =
  | 'unparseable-line'    | 'unknown-event-type'   | 'unknown-block-type'
  | 'missing-timestamp'   | 'version-mismatch'     | 'newer-format'
  | 'adapter-error'       | 'low-confidence-input' | 'empty-input';

export interface DiagnosticRecord {
  kind: DiagnosticKind;
  /** 'info' | 'warn' - never 'error' that blocks rendering. */
  level: 'info' | 'warn';
  message: string;
  line?: number;          // 1-based source line, when applicable
  snippet?: string;       // truncated, secret-unaware (PRD-06 scans the model, not diagnostics)
}

export interface ParseStats {
  inputForm: 'jsonl' | 'single-json' | 'clipboard-fragment' | 'unknown';
  totalLines: number;
  parsedRecords: number;
  events: number;
  unknownEventTypes: Record<string, number>;
  unknownBlockTypes: Record<string, number>;
  detectedVersion: string;
  /** mappedRecords + droppedToDiagnostics === parsedRecords (fidelity invariant). */
  mappedRecords: number;
  droppedToDiagnostics: number;
}
```

### 7.3 Public API

```ts
export interface ParseOptions {
  source?: 'auto' | 'claude-code';   // default 'auto'
  preserveRaw?: boolean;             // default true (FR-30)
  preserveUnparseable?: boolean;     // default false; if true, bad lines → meta events
  maxBytes?: number;                 // guard for pathological inputs
}

/** The single, pure entry point (FR-30). Never throws for content reasons (FR-24). */
export function parseSession(
  input: string | ArrayBuffer | Blob | File,
  options?: ParseOptions,
): Promise<ParseResult>;
```

### 7.4 Example transformation

**Input** (three representative Claude Code JSONL lines, abbreviated from a real `2.1.177` session):

```jsonl
{"type":"user","message":{"role":"user","content":"set the callback host/port?"},"uuid":"d3cb…","parentUuid":null,"timestamp":"2026-06-13T11:00:35.997Z","sessionId":"83e1…","cwd":"/Users/atomic/projects/personal/sandbox","version":"2.1.177","gitBranch":"HEAD","entrypoint":"cli"}
{"type":"assistant","message":{"role":"assistant","model":"claude-opus-4-8","content":[{"type":"thinking","thinking":"They need the OAuth redirect port…","signature":"Ev…"},{"type":"tool_use","id":"toolu_01Dh…","name":"Bash","input":{"command":"cat .mcp.json","description":"Read config"}}]},"uuid":"9677…","parentUuid":"d3cb…","timestamp":"2026-06-13T11:00:38.100Z","version":"2.1.177"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01Dh…","is_error":false,"content":"{ \"mcpServers\": { … } }"}]},"uuid":"a517…","parentUuid":"9677…","timestamp":"2026-06-13T11:00:38.260Z","toolUseResult":{"stdout":"{ \"mcpServers\": … }"}}
```

**Output** (`ParseResult.session`, abridged):

```jsonc
{
  "id": "83e10666-e895-497b-945c-1f1e26919223",
  "source": "claude-code",
  "formatVersion": "2.1.177",
  "meta": {
    "title": "Fix Google OAuth redirect URI configuration",  // lifted from ai-title (FR-20)
    "cwd": "/Users/atomic/projects/personal/sandbox",
    "gitBranch": "HEAD",
    "model": "claude-opus-4-8",
    "startedAt": "2026-06-13T11:00:35.997Z",
    "entrypoint": "cli"
  },
  "events": [
    { "kind": "user", "id": "d3cb…", "parentId": null, "ts": "2026-06-13T11:00:35.997Z", "lane": "main",
      "content": [ { "type": "text", "text": "set the callback host/port?" } ] },

    { "kind": "thinking", "id": "9677…#0", "parentId": "d3cb…", "ts": "2026-06-13T11:00:38.100Z", "lane": "main",
      "content": [ { "type": "text", "text": "They need the OAuth redirect port…" } ] },   // signature kept in raw (FR-13)

    { "kind": "tool_use", "id": "9677…#1", "parentId": "d3cb…", "ts": "2026-06-13T11:00:38.100Z", "lane": "main",
      "toolId": "toolu_01Dh…", "name": "Bash",
      "input": { "command": "cat .mcp.json", "description": "Read config" } },

    { "kind": "tool_result", "id": "a517…", "parentId": "9677…", "ts": "2026-06-13T11:00:38.260Z", "lane": "main",
      "forToolId": "toolu_01Dh…", "isError": false,
      "output": "{ \"mcpServers\": { … } }" }   // NOT rendered as a user bubble (FR-17)
  ]
}
```

Note: one assistant record → two events (`thinking` + `tool_use`), ids suffixed `#0/#1` to stay unique while preserving the source `uuid` prefix; the tool-result `user` record produced **no** user event (FR-17). The real `.mcp.json` output contains live-looking secrets - preserved verbatim here so **PRD-06** can detect and redact them; PRD-02 deliberately does not touch them.

## 8. Security & privacy

- **Conforms to zero-knowledge (§5.1, D-1).** The parser is **pure and offline** (FR-29/FR-30): no network, no telemetry, no globals beyond `TextDecoder`. It runs identically in browser and CLI before any encryption, so plaintext never leaves the client to be understood.
- **Faithful, non-destructive.** PRD-02 **must not** redact, mask, or drop content (it preserves `raw` by default). Redaction is PRD-06's job and happens *after* parsing. If PRD-02 silently dropped an unmodeled field, a secret hiding there would (a) be invisible to PRD-06's scanner yet (b) still ship inside `raw` elsewhere - so preservation + scanning, not dropping, is the safe combination.
- **Diagnostics are content-light.** `DiagnosticRecord.snippet` is truncated and intended for "line 42 unparseable" UX, not content dumps; downstream UI MUST treat snippets as potentially sensitive (they originate from the raw file) and keep them client-side only.
- **`preserveRaw:false` on the share path.** Once PRD-06 has scanned and PRD-05 is ready to encrypt, the upload path MAY re-parse (or strip) with `preserveRaw:false` so `raw` blobs (including thinking `signature`s and duplicate payloads) don't bloat ciphertext - reducing the metadata surface the server sees (§5.7).
- **No code execution.** `tool_use.input` and `tool_result.output` are carried as opaque `unknown` and never `eval`'d, interpolated into HTML, or executed; rendering safety (escaping/sanitization) is PRD-03's responsibility, but PRD-02 guarantees it hands over inert data.
- **Risks introduced:** memory footprint of `raw` on very large sessions (mitigated by `maxBytes` + `preserveRaw:false`); a malformed file can produce many diagnostics (bounded/aggregated to avoid UI flooding).

## 9. Dependencies

**Upstream (this PRD depends on):**
- **`_context.md` §6** - the indicative model this PRD finalizes (and should be updated to defer here).
- **D-10 / D-12** - normalized, source-agnostic, unknown-fields-preserved; Claude Code only for v1.
- None code-wise: PRD-02 is a leaf, zero-runtime-dep package - it's the foundation, intentionally built first (ROADMAP critical path PRD-01 → **PRD-02** → PRD-03).

**Downstream (these PRDs consume `@claudepad/schema`):**
- **PRD-03 (Viewer)** - renders `Session.events`; relies on `ContentBlock` variants, `raw`/`meta` graceful degradation, and `lane` for sidechain grouping.
- **PRD-04 (Ingest)** - calls `parseSession` on drag-drop/paste/CLI input; surfaces `diagnostics` in the onboarding UI; relies on `clipboard-fragment`/`single-json` forms (FR-4/FR-5).
- **PRD-05 (Crypto)** - encrypts the normalized `Session` (and PRD-06's secret map); benefits from `preserveRaw:false` lean output.
- **PRD-06 (Secrets)** - scans `ContentBlock` text + `tool_use.input` + `tool_result.output` + `raw`; replaces detected values with placeholders **post-parse**. Hard dependency on PRD-02 preserving plaintext faithfully.
- **PRD-08 (Playback)** - depends on the **total ordering + ISO timestamps + `lane`** (FR-25..28) and `meta.startedAt/endedAt` to drive the timeline/scrubber and pacing.

## 10. Acceptance criteria / DoD

- [ ] `@claudepad/schema` package exists, zero runtime deps, builds for browser + Node, exports `parseSession`, all types, `SCHEMA_VERSION`.
- [ ] `parseSession` implements FR-1 … FR-31; each FR has ≥1 passing Vitest case.
- [ ] **Never-throws invariant** proven by a `fast-check` property test over random/mutated bytes (FR-24, §6.3).
- [ ] **Fidelity invariant** test passes: `mappedRecords + droppedToDiagnostics === parsedRecords` on every fixture (no silent drops).
- [ ] Versioned fixture corpus committed (redacted real sessions spanning ≥ the observed `2.1.140`–`2.1.183` range) + golden snapshots per fixture; CI fails on snapshot drift.
- [ ] Synthetic adversarial fixtures (truncated EOF, bad JSON line, empty, BOM, CRLF, unknown type, unknown block, string vs array content, tool_result-only turn, missing/out-of-order timestamps, image block, large file) all parse without throwing and with correct diagnostics.
- [ ] Ordering test: deterministic; DAG-then-timestamp-then-file-order precedence; sidechain events correctly laned.
- [ ] Timestamp normalization test: all `ts` are valid ISO-8601 UTC or `undefined` (never `Invalid Date`); `meta.startedAt/endedAt` correct.
- [ ] Unknown event type → `meta`+`raw`; unknown block → `raw`; both render-safe (verified structurally; visual verification deferred to PRD-03).
- [ ] Coverage gate met on `parse.ts`, `order.ts`, `adapters/claude-code/**`.
- [ ] Public API docs / typedoc for `parseSession`, `ParseResult`, and the type spec; `_context.md` §6 updated to reference this PRD as authoritative.
- [ ] A documented "add a new format version" runbook (drop fixture → update version table → triage snapshot diff).

## 11. Open questions

- **OQ-1 (raw retention default).** Keep `preserveRaw:true` by default everywhere, or default it off on the share/upload path automatically after PRD-06 scans? *Leaning: on by default for local/view fidelity; PRD-05/06 explicitly opt into `preserveRaw:false` before encryption.* Needs sign-off with PRD-05.
- **OQ-2 (code-block promotion).** Should the parser promote fenced ` ```lang ` text inside `text` blocks into `{type:'code', lang}` ContentBlocks, or leave that entirely to PRD-03's markdown renderer? *Leaning: leave raw text; let PRD-03 own markdown/code detection - keeps the parser source-faithful and avoids double-parsing.* Confirm with PRD-03.
- **OQ-3 (sidechain rendering contract).** PRD-02 lanes sub-agent events (`lane: 'sidechain:<id>'`); do PRD-03/PRD-08 want them inlined-but-collapsible, in a side panel, or hidden by default? Schema supports all three; the *default presentation* is a PRD-03/08 decision.
- **OQ-4 (session `id` when `sessionId` absent).** For pasted fragments with no `sessionId`, derive `id` from a content hash (stable, deterministic) vs. a random UUID (simpler, non-deterministic). *Leaning: content hash for dedupe/idempotency; confirm hash choice is non-cryptographic/cheap and not confused with PRD-05 keys.*
- **OQ-5 (image bytes).** v1 corpus showed no image blocks, but Claude Code supports pasted images. Confirm the real shape (`source.type: 'base64' | 'url'`, `media_type`) against a fixture before locking `ContentBlock{type:'image'}` `encoding` field - treat current shape as best-effort until a real image fixture exists.
- **OQ-6 (`toolUseResult` vs inline `tool_result`).** Real records carry both a top-level `toolUseResult` (structured: `stdout`/`stderr`/etc.) and an inline `tool_result` block (flattened string). Which is canonical for PRD-03 rendering, and do we expose both? *Leaning: prefer the richer `toolUseResult` as `output`, keep the inline block in `raw`; revisit per tool type with PRD-03.*

## 12. Phase / milestone

**Phase P0 - Foundation.** On the ROADMAP critical path immediately after PRD-01 (`PRD-01 → PRD-02 → PRD-03 → …`). Nothing user-visible ships from P0, but PRD-02 is the data spine every downstream feature is built on; it must land, with its fixture corpus and never-throws guarantees, before the P1 viewer (PRD-03) and ingest (PRD-04) work begins. Directly owns the ROADMAP success metric *"Parser resilience: renders the last N released Claude Code session formats without crashing; unknown fields degrade gracefully"* and mitigates the top ROADMAP risk *"Claude Code JSONL format is undocumented & changes."*
