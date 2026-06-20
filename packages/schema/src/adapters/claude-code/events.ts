// events.ts — Claude Code record → SessionEvent(s) mappers (FR-10..FR-21).

import type {
  AssistantEvent,
  ContentBlock,
  MetaEvent,
  SessionEvent,
  ThinkingEvent,
  ToolResultEvent,
  ToolUseEvent,
  UserEvent,
} from '../../types';
import type { RawRecord } from '../../detect';
import { isObject } from '../../detect';
import { normalizeTimestamp } from '../../time';
import type { RawBlock } from './content';
import { mapImageBlock, mapTextBlock, rawBlock, stringToTextBlock } from './content';

export interface MapContext {
  preserveRaw: boolean;
}

export interface MapOutput {
  events: SessionEvent[];
  /** Unknown top-level type encountered (for stats/diagnostics). */
  unknownEventType?: string;
  /** Unknown content block types encountered (for stats). */
  unknownBlockTypes: string[];
  /** True when at least one timestamp was missing/invalid. */
  missingTimestamp: boolean;
}

/** Session-scoped metadata record types lifted/folded, not conversation turns. */
const SESSION_META_TYPES = new Set([
  'ai-title',
  'mode',
  'permission-mode',
  'last-prompt',
  'file-history-snapshot',
  'attachment',
  'queue-operation',
  'bridge-session',
  'pr-link',
  'agent-name',
  'agent-setting',
  'summary',
]);

const KNOWN_EVENT_TYPES = new Set(['user', 'assistant', 'system', ...SESSION_META_TYPES]);

export function isSessionMetaType(type: string): boolean {
  return SESSION_META_TYPES.has(type);
}

export function isKnownEventType(type: string): boolean {
  return KNOWN_EVENT_TYPES.has(type);
}

/** Compute the lane for a record (FR-28): 'main' or 'sidechain:<sessionId>'. */
function laneOf(rec: RawRecord): string {
  if (rec['isSidechain'] === true) {
    const sid = rec['sessionId'];
    return typeof sid === 'string' ? `sidechain:${sid}` : 'sidechain:unknown';
  }
  return 'main';
}

function baseFields(
  rec: RawRecord,
  ctx: MapContext,
): {
  id?: string;
  parentId?: string | null;
  ts?: string;
  lane: string;
  meta?: boolean;
  raw?: unknown;
  missingTimestamp: boolean;
} {
  const out: ReturnType<typeof baseFields> = {
    lane: laneOf(rec),
    missingTimestamp: false,
  };
  const uuid = rec['uuid'];
  if (typeof uuid === 'string') out.id = uuid;
  if ('parentUuid' in rec) {
    const p = rec['parentUuid'];
    out.parentId = typeof p === 'string' ? p : null;
  }
  if ('timestamp' in rec) {
    const ts = normalizeTimestamp(rec['timestamp']);
    if (ts !== undefined) out.ts = ts;
    else out.missingTimestamp = true;
  } else {
    out.missingTimestamp = true;
  }
  if (rec['isMeta'] === true) out.meta = true;
  if (ctx.preserveRaw) out.raw = rec;
  return out;
}

/** Apply shared EventBase fields from a base descriptor onto an event. */
function applyBase<T extends SessionEvent>(
  ev: T,
  base: ReturnType<typeof baseFields>,
  idSuffix?: string,
): T {
  if (base.id !== undefined) ev.id = idSuffix ? `${base.id}${idSuffix}` : base.id;
  if (base.parentId !== undefined) ev.parentId = base.parentId;
  if (base.ts !== undefined) ev.ts = base.ts;
  ev.lane = base.lane;
  if (base.meta !== undefined) ev.meta = base.meta;
  if (base.raw !== undefined) ev.raw = base.raw;
  return ev;
}

function emptyOutput(): MapOutput {
  return { events: [], unknownBlockTypes: [], missingTimestamp: false };
}

/** Map a single Claude Code record to zero or more events. */
export function mapRecord(rec: RawRecord, ctx: MapContext): MapOutput {
  const type = rec['type'];
  if (typeof type !== 'string') {
    return mapUnknown(rec, ctx, '(no-type)');
  }
  switch (type) {
    case 'user':
      return mapUser(rec, ctx);
    case 'assistant':
      return mapAssistant(rec, ctx);
    case 'system':
      return mapSystem(rec, ctx);
    default:
      if (isSessionMetaType(type)) return mapSessionMeta(rec, ctx, type);
      return mapUnknown(rec, ctx, type);
  }
}

function mapUser(rec: RawRecord, ctx: MapContext): MapOutput {
  const out = emptyOutput();
  const base = baseFields(rec, ctx);
  out.missingTimestamp = base.missingTimestamp;

  const message = rec['message'];
  const content = isObject(message) ? message['content'] : undefined;

  // Bare-string content → single text block, a human user turn (FR-12).
  if (typeof content === 'string') {
    const ev: UserEvent = { kind: 'user', content: [stringToTextBlock(content)] };
    out.events.push(applyBase(ev, base));
    return out;
  }

  if (Array.isArray(content)) {
    const toolResults: ToolResultEvent[] = [];
    const userBlocks: ContentBlock[] = [];
    for (const rawB of content) {
      if (!isObject(rawB)) {
        userBlocks.push(rawBlock(rawB));
        continue;
      }
      const block = rawB as RawBlock;
      const bType = block['type'];
      if (bType === 'tool_result') {
        toolResults.push(mapToolResult(rec, block, base, ctx));
        continue;
      }
      const mapped = mapUserContentBlock(block, out);
      userBlocks.push(mapped);
    }

    // A user record whose content is ONLY tool_result blocks is a tool turn,
    // not human input → emit tool_result events only, no user bubble (FR-17).
    if (toolResults.length > 0 && userBlocks.length === 0) {
      out.events.push(...toolResults);
      return out;
    }

    // Mixed or human content: emit a user event (if any human blocks) plus any
    // tool_result events.
    if (userBlocks.length > 0) {
      const ev: UserEvent = { kind: 'user', content: userBlocks };
      out.events.push(applyBase(ev, base));
    }
    out.events.push(...toolResults);
    return out;
  }

  // No usable content: emit an empty user event so the record is accounted for.
  const ev: UserEvent = { kind: 'user', content: [] };
  out.events.push(applyBase(ev, base));
  return out;
}

function mapUserContentBlock(block: RawBlock, out: MapOutput): ContentBlock {
  const bType = block['type'];
  if (bType === 'text') {
    const t = mapTextBlock(block);
    if (t) return t;
  }
  if (bType === 'image') {
    return mapImageBlock(block);
  }
  // Unknown block in a user turn → raw (FR-22).
  if (typeof bType === 'string' && bType !== 'text' && bType !== 'image') {
    out.unknownBlockTypes.push(bType);
  } else if (typeof bType !== 'string') {
    out.unknownBlockTypes.push('(no-type)');
  }
  return rawBlock(block);
}

function mapAssistant(rec: RawRecord, ctx: MapContext): MapOutput {
  const out = emptyOutput();
  const base = baseFields(rec, ctx);
  out.missingTimestamp = base.missingTimestamp;

  const message = rec['message'];
  const model = isObject(message) ? message['model'] : undefined;
  const modelStr = typeof model === 'string' ? model : undefined;
  const content = isObject(message) ? message['content'] : undefined;

  // Bare-string content → single assistant text event.
  if (typeof content === 'string') {
    const ev: AssistantEvent = {
      kind: 'assistant',
      content: [stringToTextBlock(content)],
    };
    if (modelStr) ev.model = modelStr;
    out.events.push(applyBase(ev, base));
    return out;
  }

  if (!Array.isArray(content)) {
    const ev: AssistantEvent = { kind: 'assistant', content: [] };
    if (modelStr) ev.model = modelStr;
    out.events.push(applyBase(ev, base));
    return out;
  }

  // One assistant record with N blocks → N events; ids suffixed #0,#1,… (FR-11).
  // Consecutive text/image blocks coalesce into the most recent assistant event
  // so an assistant turn keeps its content together while thinking/tool_use
  // split out as their own events.
  let blockIndex = 0;
  let currentAssistant: AssistantEvent | undefined;

  for (const rawB of content) {
    if (!isObject(rawB)) {
      currentAssistant = pushAssistantBlock(
        out,
        base,
        modelStr,
        currentAssistant,
        rawBlock(rawB),
        blockIndex++,
      );
      continue;
    }
    const block = rawB as RawBlock;
    const bType = block['type'];

    if (bType === 'thinking' || bType === 'redacted_thinking') {
      currentAssistant = undefined;
      const ev: ThinkingEvent = {
        kind: 'thinking',
        content:
          bType === 'redacted_thinking'
            ? []
            : [{ type: 'text', text: thinkingText(block) }],
      };
      if (bType === 'redacted_thinking') ev.redacted = true;
      out.events.push(applyBase(ev, base, `#${blockIndex++}`));
      continue;
    }

    if (bType === 'tool_use') {
      currentAssistant = undefined;
      const ev: ToolUseEvent = {
        kind: 'tool_use',
        name: typeof block['name'] === 'string' ? block['name'] : '',
        input: block['input'],
      };
      const id = block['id'];
      if (typeof id === 'string') ev.toolId = id;
      out.events.push(applyBase(ev, base, `#${blockIndex++}`));
      continue;
    }

    if (bType === 'text') {
      const t = mapTextBlock(block) ?? rawBlock(block);
      currentAssistant = pushAssistantBlock(
        out,
        base,
        modelStr,
        currentAssistant,
        t,
        blockIndex++,
      );
      continue;
    }

    if (bType === 'image') {
      currentAssistant = pushAssistantBlock(
        out,
        base,
        modelStr,
        currentAssistant,
        mapImageBlock(block),
        blockIndex++,
      );
      continue;
    }

    // Unknown block type → raw ContentBlock on an assistant event (FR-22).
    if (typeof bType === 'string') out.unknownBlockTypes.push(bType);
    else out.unknownBlockTypes.push('(no-type)');
    currentAssistant = pushAssistantBlock(
      out,
      base,
      modelStr,
      currentAssistant,
      rawBlock(block),
      blockIndex++,
    );
  }

  // An assistant record with no events at all (e.g. empty array) still counts.
  if (out.events.length === 0) {
    const ev: AssistantEvent = { kind: 'assistant', content: [] };
    if (modelStr) ev.model = modelStr;
    out.events.push(applyBase(ev, base));
  }
  return out;
}

function pushAssistantBlock(
  out: MapOutput,
  base: ReturnType<typeof baseFields>,
  modelStr: string | undefined,
  current: AssistantEvent | undefined,
  block: ContentBlock,
  index: number,
): AssistantEvent {
  if (current) {
    current.content.push(block);
    return current;
  }
  const ev: AssistantEvent = { kind: 'assistant', content: [block] };
  if (modelStr) ev.model = modelStr;
  applyBase(ev, base, `#${index}`);
  out.events.push(ev);
  return ev;
}

function thinkingText(block: RawBlock): string {
  const t = block['thinking'];
  return typeof t === 'string' ? t : '';
}

/**
 * Map a tool_result. Prefers the richer top-level `toolUseResult` payload as
 * `output`, keeping the inline block (and vice versa) in `raw` (FR-16).
 */
function mapToolResult(
  rec: RawRecord,
  inlineBlock: RawBlock,
  base: ReturnType<typeof baseFields>,
  ctx: MapContext,
): ToolResultEvent {
  const ev: ToolResultEvent = {
    kind: 'tool_result',
    output: inlineBlock['content'],
  };
  const forToolId = inlineBlock['tool_use_id'];
  if (typeof forToolId === 'string') ev.forToolId = forToolId;
  if ('is_error' in inlineBlock) ev.isError = inlineBlock['is_error'] === true;

  // Prefer the richer top-level toolUseResult when present.
  const tur = rec['toolUseResult'];
  if (tur !== undefined) {
    ev.output = tur;
    if (isObject(tur) && 'isError' in tur) ev.isError = tur['isError'] === true;
  }

  applyBase(ev, base);
  // Keep both payloads in raw so nothing is lost (FR-16).
  if (ctx.preserveRaw) ev.raw = rec;
  return ev;
}

/** Map `type:"system"` records to meta events (FR-18). */
function mapSystem(rec: RawRecord, ctx: MapContext): MapOutput {
  const out = emptyOutput();
  const base = baseFields(rec, ctx);
  out.missingTimestamp = base.missingTimestamp;
  const subtype = rec['subtype'];
  const subtypeStr = typeof subtype === 'string' ? subtype : undefined;
  const ev: MetaEvent = {
    kind: 'meta',
    note: subtypeStr ? `system:${subtypeStr}` : 'system',
  };
  if (subtypeStr) ev.subtype = subtypeStr;
  out.events.push(applyBase(ev, base));
  return out;
}

/** Map a recognized session-scoped metadata record to a meta event (FR-20). */
function mapSessionMeta(rec: RawRecord, ctx: MapContext, type: string): MapOutput {
  const out = emptyOutput();
  const base = baseFields(rec, ctx);
  out.missingTimestamp = base.missingTimestamp;
  const ev: MetaEvent = { kind: 'meta', note: type, subtype: type };
  out.events.push(applyBase(ev, base));
  return out;
}

/** Map a record with an unrecognized `type` to a meta event + raw (FR-21). */
function mapUnknown(rec: RawRecord, ctx: MapContext, type: string): MapOutput {
  const out = emptyOutput();
  const base = baseFields(rec, ctx);
  out.missingTimestamp = base.missingTimestamp;
  out.unknownEventType = type;
  const ev: MetaEvent = { kind: 'meta', note: type };
  // Always preserve the original record for an unknown type, even if
  // preserveRaw is false — it's the only place the unmodeled data survives.
  applyBase(ev, base);
  ev.raw = rec;
  out.events.push(ev);
  return out;
}
