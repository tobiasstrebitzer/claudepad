// parse.ts - parseSession() orchestration (FR-24, FR-30).
//
// detect → tokenize → per-line JSON.parse (with diagnostics) → adapter map per
// record (each wrapped in try/catch so one bad record can't crash) → order +
// normalize. Returns a ParseResult and NEVER throws for content reasons.

import type {
  DiagnosticRecord,
  ParseOptions,
  ParseResult,
  Session,
  SessionEvent,
  SessionMeta,
} from './types';
import { SCHEMA_VERSION } from './types';
import { decodeUtf8 } from './tokenize';
import { tokenizeLines } from './tokenize';
import { detectInputForm, detectSource, detectVersion, isObject } from './detect';
import type { RawRecord } from './detect';
import { diag, snippet, StatsAccumulator } from './diagnostics';
import { orderEvents } from './order';
import { claudeCodeAdapter, deriveTimeBounds } from './adapters/claude-code/index';
import { isNewerThanKnown } from './adapters/claude-code/version';

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024; // 64 MB guard for pathological inputs.

/**
 * The single, pure entry point (FR-30). Accepts string | ArrayBuffer | Blob |
 * File. Never throws for content reasons (FR-24).
 */
export async function parseSession(
  input: string | ArrayBuffer | Blob | File,
  options?: ParseOptions,
): Promise<ParseResult> {
  const opts: Required<Pick<ParseOptions, 'preserveRaw' | 'preserveUnparseable'>> &
    ParseOptions = {
    source: options?.source ?? 'auto',
    preserveRaw: options?.preserveRaw ?? true,
    preserveUnparseable: options?.preserveUnparseable ?? false,
  };
  if (options?.maxBytes !== undefined) opts.maxBytes = options.maxBytes;

  let text: string;
  try {
    text = await toText(input, opts.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch {
    // Even a decode failure must not throw - return an empty session.
    text = '';
  }

  return parseText(text, opts);
}

function parseText(
  text: string,
  opts: ParseOptions & { preserveRaw: boolean; preserveUnparseable: boolean },
): ParseResult {
  const stats = new StatsAccumulator();
  const diagnostics: DiagnosticRecord[] = [];

  // Empty / whitespace-only → valid empty session (FR-6).
  if (text.trim().length === 0) {
    stats.inputForm = 'unknown';
    diagnostics.push(
      diag('empty-input', 'Input was empty or whitespace-only.', { level: 'info' }),
    );
    return makeResult(emptySession(), diagnostics, stats);
  }

  const form = detectInputForm(text);
  stats.inputForm = form.form;

  // clipboard-fragment / unknown non-JSON text → single user text event (FR-5).
  if (
    form.form === 'clipboard-fragment' ||
    (form.form === 'unknown' && form.records.length === 0)
  ) {
    diagnostics.push(
      diag(
        'low-confidence-input',
        'Input did not look like Claude Code JSONL; treated as pasted text.',
        {
          level: 'info',
        },
      ),
    );
    const session = fragmentSession(text, opts.preserveRaw);
    stats.totalLines = tokenizeLines(text).length;
    stats.parsedRecords = 0;
    stats.events = session.events.length;
    stats.mappedRecords = 0;
    stats.droppedToDiagnostics = 0;
    return makeResult(session, diagnostics, stats);
  }

  // jsonl / single-json: tokenize, parse each line, collect records + diagnostics.
  const lines = tokenizeLines(text);
  stats.totalLines = lines.length;

  const records: RawRecord[] = [];
  for (const l of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(l.text);
    } catch {
      diagnostics.push(
        diag('unparseable-line', `Line ${l.line} is not valid JSON and was skipped.`, {
          line: l.line,
          snippet: snippet(l.text),
        }),
      );
      if (opts.preserveUnparseable) {
        // Preserve as a meta event so nothing silently vanishes.
        records.push({ type: '__unparseable__', __line: l.line, __text: l.text });
      }
      continue;
    }
    if (isObject(parsed)) {
      records.push(parsed);
    } else if (Array.isArray(parsed)) {
      for (const item of parsed) if (isObject(item)) records.push(item);
    } else {
      diagnostics.push(
        diag('unparseable-line', `Line ${l.line} was a JSON scalar, not a record.`, {
          line: l.line,
          snippet: snippet(l.text),
        }),
      );
    }
  }

  stats.parsedRecords = records.length;

  // Version detection (FR-8/FR-9).
  const ver = detectVersion(records);
  stats.detectedVersion = ver.version;
  if (ver.mismatch) {
    diagnostics.push(
      diag(
        'version-mismatch',
        `Records reported multiple format versions; using "${ver.version}".`,
      ),
    );
  }
  if (isNewerThanKnown(ver.version)) {
    diagnostics.push(
      diag(
        'newer-format',
        `Session format ${ver.version} is newer than this build was authored against.`,
        {
          level: 'info',
        },
      ),
    );
  }

  // Source (v1 always claude-code, structurally detected for confidence).
  const source = detectSource(records);

  // Map each record, wrapped so one throw → diagnostic + meta event (FR-24).
  const events: SessionEvent[] = [];
  for (const rec of records) {
    try {
      const out = claudeCodeAdapter.mapRecord(rec, { preserveRaw: opts.preserveRaw });
      for (const e of out.events) events.push(e);
      stats.events += out.events.length;
      if (out.unknownEventType !== undefined) {
        stats.noteUnknownEvent(out.unknownEventType);
        diagnostics.push(
          diag(
            'unknown-event-type',
            `Unrecognized record type "${out.unknownEventType}" preserved as meta.`,
          ),
        );
      }
      for (const bt of out.unknownBlockTypes) {
        stats.noteUnknownBlock(bt);
        diagnostics.push(
          diag(
            'unknown-block-type',
            `Unrecognized content block "${bt}" preserved as raw.`,
          ),
        );
      }
      if (out.missingTimestamp) {
        diagnostics.push(
          diag('missing-timestamp', 'A record had a missing or invalid timestamp.', {
            level: 'info',
          }),
        );
      }
      stats.mappedRecords++;
    } catch (err) {
      // Defensive: a thrown adapter error becomes a meta event + diagnostic.
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push(
        diag(
          'adapter-error',
          `A record failed to map and was preserved as meta: ${message}`,
        ),
      );
      const metaEvent: SessionEvent = {
        kind: 'meta',
        note: 'adapter-error',
        raw: rec,
        lane: 'main',
      };
      const uuid = rec['uuid'];
      if (typeof uuid === 'string') metaEvent.id = uuid;
      events.push(metaEvent);
      stats.events += 1;
      stats.droppedToDiagnostics++;
    }
  }

  // Order (FR-25).
  const orderedEvents = orderEvents(events);

  // Lift meta + time bounds (FR-20, FR-27).
  const liftedMeta = safeLiftMeta(records);
  const bounds = deriveTimeBounds(records);

  const meta: SessionMeta = { ...liftedMeta };
  if (bounds.startedAt !== undefined) meta.startedAt = bounds.startedAt;
  if (bounds.endedAt !== undefined) meta.endedAt = bounds.endedAt;

  const session: Session = {
    id: deriveSessionId(records, text),
    source,
    formatVersion: ver.version,
    meta,
    events: orderedEvents,
  };

  return makeResult(session, diagnostics, stats);
}

function safeLiftMeta(records: RawRecord[]): Partial<SessionMeta> {
  try {
    return claudeCodeAdapter.liftMeta(records);
  } catch {
    return {};
  }
}

async function toText(
  input: string | ArrayBuffer | Blob | File,
  maxBytes: number,
): Promise<string> {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    const bytes = input.byteLength > maxBytes ? input.slice(0, maxBytes) : input;
    return decodeUtf8(bytes);
  }
  // Blob | File: read bytes via .arrayBuffer().
  if (typeof (input as Blob).arrayBuffer === 'function') {
    const ab = await (input as Blob).arrayBuffer();
    const bytes = ab.byteLength > maxBytes ? ab.slice(0, maxBytes) : ab;
    return decodeUtf8(bytes);
  }
  // Unknown input shape: stringify defensively.
  return String(input);
}

function makeResult(
  session: Session,
  diagnostics: DiagnosticRecord[],
  stats: StatsAccumulator,
): ParseResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    session,
    diagnostics,
    stats: stats.finalize(),
  };
}

function emptySession(): Session {
  return {
    id: 'empty',
    source: 'claude-code',
    formatVersion: 'unknown',
    meta: {},
    events: [],
  };
}

function fragmentSession(text: string, preserveRaw: boolean): Session {
  const event: SessionEvent = {
    kind: 'user',
    content: [{ type: 'text', text }],
    lane: 'main',
  };
  if (preserveRaw) event.raw = { type: 'clipboard-fragment', text };
  return {
    id: hashId(text),
    source: 'claude-code',
    formatVersion: 'unknown',
    meta: { title: firstLine(text) },
    events: [event],
  };
}

function firstLine(text: string): string {
  const line = text.split('\n')[0]?.trim() ?? '';
  return line.length > 80 ? line.slice(0, 80) : line;
}

/** Derive a stable session id: source sessionId when present, else content hash. */
function deriveSessionId(records: RawRecord[], text: string): string {
  for (const r of records) {
    const sid = r['sessionId'];
    if (typeof sid === 'string' && sid.length > 0) return sid;
  }
  return hashId(text);
}

/** Cheap, non-cryptographic content hash for stable ids (FNV-1a, OQ-4). */
function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'h' + (h >>> 0).toString(16).padStart(8, '0');
}
