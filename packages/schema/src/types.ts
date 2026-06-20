// @claudepad/schema — types.ts
//
// Authoritative TypeScript types for the normalized, source-agnostic Session
// model (PRD-02 §7). Where this differs from `_context.md` §6, this file wins.

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
  title?: string; // from ai-title / first user line
  cwd?: string; // working directory
  gitBranch?: string;
  startedAt?: string; // ISO-8601 UTC, earliest event ts
  endedAt?: string; // ISO-8601 UTC, latest event ts
  model?: string; // dominant assistant model
  entrypoint?: string; // e.g. "cli"
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
  /** 'main' | 'sidechain:<id>' — sub-agent laning (FR-28). */
  lane?: string;
  /** True when source flagged isMeta (de-emphasize in UI) (FR-19). */
  meta?: boolean;
  /** Original source record, preserved unless preserveRaw:false (FR-23, FR-30). */
  raw?: unknown;
}

export interface UserEvent extends EventBase {
  kind: 'user';
  content: ContentBlock[];
}
export interface AssistantEvent extends EventBase {
  kind: 'assistant';
  model?: string;
  content: ContentBlock[];
}
export interface ThinkingEvent extends EventBase {
  kind: 'thinking';
  content: ContentBlock[];
  redacted?: boolean;
}
export interface ToolUseEvent extends EventBase {
  kind: 'tool_use';
  toolId?: string;
  name: string;
  input: unknown;
}
export interface ToolResultEvent extends EventBase {
  kind: 'tool_result';
  /** Correlates to ToolUseEvent.toolId (Anthropic tool_use_id). */
  forToolId?: string;
  forName?: string;
  output: unknown;
  isError?: boolean;
}
/** Anything unrecognized or non-conversational, preserved (FR-18, FR-20, FR-21). */
export interface MetaEvent extends EventBase {
  kind: 'meta';
  note: string;
  subtype?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; lang?: string; text: string } // parser MAY promote fenced text → code; else stays text
  | {
      type: 'image';
      ref: string;
      mediaType?: string;
      encoding?: 'base64' | 'url' | 'file';
    }
  | { type: 'raw'; value: unknown }; // unknown blocks degrade gracefully, never crash (FR-22)

export interface ParseResult {
  schemaVersion: typeof SCHEMA_VERSION;
  session: Session;
  diagnostics: DiagnosticRecord[];
  stats: ParseStats;
}

export type DiagnosticKind =
  | 'unparseable-line'
  | 'unknown-event-type'
  | 'unknown-block-type'
  | 'missing-timestamp'
  | 'version-mismatch'
  | 'newer-format'
  | 'adapter-error'
  | 'low-confidence-input'
  | 'empty-input';

export interface DiagnosticRecord {
  kind: DiagnosticKind;
  /** 'info' | 'warn' — never 'error' that blocks rendering. */
  level: 'info' | 'warn';
  message: string;
  line?: number; // 1-based source line, when applicable
  snippet?: string; // truncated, secret-unaware (PRD-06 scans the model, not diagnostics)
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

export interface ParseOptions {
  source?: 'auto' | 'claude-code'; // default 'auto'
  preserveRaw?: boolean; // default true (FR-30)
  preserveUnparseable?: boolean; // default false; if true, bad lines → meta events
  maxBytes?: number; // guard for pathological inputs
}
