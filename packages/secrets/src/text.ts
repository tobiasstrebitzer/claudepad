// Where secrets can live in a normalized Session (PRD-06 FR-1), and how to walk
// those locations for scanning (read) and redaction (rewrite). Everything else is
// copied through unchanged — PRD-02's "preserve unknown, never crash" invariant
// (FR-26).
//
// Scanned locations: text/code content blocks of user/assistant/thinking events,
// tool_use.input (all string leaves), and tool_result.output (string, or string
// leaves of an object).

import type { Session, SessionEvent, ContentBlock } from '@claudepad/schema';

type StringFn = (s: string) => string;

/** Recursively transform every string leaf of an unknown value (tool I/O). */
function mapUnknown(value: unknown, fn: StringFn): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapUnknown(v, fn));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapUnknown(v, fn);
    return out;
  }
  return value;
}

function mapBlock(block: ContentBlock, fn: StringFn): ContentBlock {
  if (block.type === 'text') return { ...block, text: fn(block.text) };
  if (block.type === 'code') return { ...block, text: fn(block.text) };
  return block; // image / raw: left untouched
}

function mapEvent(event: SessionEvent, fn: StringFn): SessionEvent {
  switch (event.kind) {
    case 'user':
    case 'assistant':
    case 'thinking':
      return { ...event, content: event.content.map((b) => mapBlock(b, fn)) };
    case 'tool_use':
      return { ...event, input: mapUnknown(event.input, fn) };
    case 'tool_result':
      return { ...event, output: mapUnknown(event.output, fn) };
    default:
      return event;
  }
}

/** A structurally-identical session with every scannable string transformed. */
export function mapSessionStrings(session: Session, fn: StringFn): Session {
  return { ...session, events: session.events.map((e) => mapEvent(e, fn)) };
}

/** Collect every scannable string in document order (for scanning). */
export function collectStrings(session: Session): string[] {
  const out: string[] = [];
  mapSessionStrings(session, (s) => {
    out.push(s);
    return s;
  });
  return out;
}
