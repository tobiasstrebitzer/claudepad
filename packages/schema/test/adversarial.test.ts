import { describe, it, expect } from 'vitest';
import { parseSession, SCHEMA_VERSION } from '../src/index';
import type { ContentBlock, SessionEvent } from '../src/index';

function kinds(events: SessionEvent[]): string[] {
  return events.map((e) => e.kind);
}

function diagKinds(diags: { kind: string }[]): string[] {
  return diags.map((d) => d.kind);
}

const TS1 = '2026-06-13T11:00:35.997Z';
const TS2 = '2026-06-13T11:00:38.100Z';

describe('FR-1 / FR-2 - input forms, BOM, CRLF, truncated EOF', () => {
  it('FR-1: accepts string input', async () => {
    const res = await parseSession(
      `{"type":"user","uuid":"a","message":{"content":"hi"}}`,
    );
    expect(res.session.events.length).toBe(1);
  });

  it('FR-1: accepts ArrayBuffer and strips a UTF-8 BOM', async () => {
    const json = `{"type":"user","uuid":"a","message":{"content":"hi"}}`;
    const withBom = '﻿' + json;
    const bytes = new TextEncoder().encode(withBom);
    const res = await parseSession(bytes.buffer as ArrayBuffer);
    expect(res.session.events.length).toBe(1);
    expect((res.session.events[0] as { content: ContentBlock[] }).content[0]).toEqual({
      type: 'text',
      text: 'hi',
    });
  });

  it('FR-1: accepts a Blob via .arrayBuffer()', async () => {
    const json = `{"type":"user","uuid":"a","message":{"content":"hi"}}`;
    const blob = new Blob([json], { type: 'application/x-ndjson' });
    const res = await parseSession(blob);
    expect(res.session.events.length).toBe(1);
  });

  it('FR-2: tolerates CRLF line endings', async () => {
    const input =
      `{"type":"user","uuid":"a","message":{"content":"one"}}\r\n` +
      `{"type":"user","uuid":"b","message":{"content":"two"}}\r\n`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(2);
  });

  it('FR-2: tolerates blank lines and leading/trailing whitespace', async () => {
    const input =
      `\n   {"type":"user","uuid":"a","message":{"content":"one"}}   \n\n\n` +
      `{"type":"user","uuid":"b","message":{"content":"two"}}\n`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(2);
  });

  it('FR-2: tolerates a truncated final line without throwing', async () => {
    const input =
      `{"type":"user","uuid":"a","message":{"content":"ok"}}\n` +
      `{"type":"assistant","uuid":"b","message":{"content":[{"type":"te`; // cut off
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(1); // good line maps; truncated → diagnostic
    expect(diagKinds(res.diagnostics)).toContain('unparseable-line');
  });
});

describe('FR-3 - unparseable line mid-file', () => {
  it('emits unparseable-line and keeps going', async () => {
    const input =
      `{"type":"user","uuid":"a","message":{"content":"one"}}\n` +
      `{ this is not json }\n` +
      `{"type":"user","uuid":"b","message":{"content":"two"}}`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(2);
    const d = res.diagnostics.find((x) => x.kind === 'unparseable-line');
    expect(d).toBeDefined();
    expect(d?.line).toBe(2);
    expect(d?.snippet).toBeDefined();
  });

  it('FR-3: preserveUnparseable maps bad lines to meta events', async () => {
    const input = `{ bad }\n{"type":"user","uuid":"a","message":{"content":"x"}}`;
    const res = await parseSession(input, { preserveUnparseable: true });
    const metas = res.session.events.filter((e) => e.kind === 'meta');
    expect(metas.length).toBeGreaterThanOrEqual(1);
  });
});

describe('FR-4 / FR-5 - input-form detection + clipboard fragment', () => {
  it('FR-4: detects jsonl', async () => {
    const input =
      `{"type":"user","uuid":"a","message":{"content":"one"}}\n` +
      `{"type":"user","uuid":"b","message":{"content":"two"}}`;
    const res = await parseSession(input);
    expect(res.stats.inputForm).toBe('jsonl');
  });

  it('FR-4: detects single-json (one pasted object)', async () => {
    const input = `{"type":"user","uuid":"a","message":{"content":"hi"}}`;
    const res = await parseSession(input);
    expect(res.stats.inputForm).toBe('single-json');
  });

  it('FR-4/FR-5: clipboard-fragment → single user text event + low-confidence', async () => {
    const input = `just some pasted prose\nthat is not JSON at all`;
    const res = await parseSession(input);
    expect(res.stats.inputForm).toBe('clipboard-fragment');
    expect(res.session.events.length).toBe(1);
    expect(res.session.events[0]?.kind).toBe('user');
    expect(diagKinds(res.diagnostics)).toContain('low-confidence-input');
  });
});

describe('FR-6 - empty input', () => {
  it('returns an empty session + empty-input diagnostic, never throws', async () => {
    const res = await parseSession('   \n\n  ');
    expect(res.session.events.length).toBe(0);
    expect(diagKinds(res.diagnostics)).toContain('empty-input');
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('FR-8 / FR-9 - version detection', () => {
  it('FR-8: picks most-frequent version and flags mismatch', async () => {
    const input =
      `{"type":"user","uuid":"a","version":"2.1.177","message":{"content":"x"}}\n` +
      `{"type":"user","uuid":"b","version":"2.1.177","message":{"content":"y"}}\n` +
      `{"type":"user","uuid":"c","version":"2.1.160","message":{"content":"z"}}`;
    const res = await parseSession(input);
    expect(res.session.formatVersion).toBe('2.1.177');
    expect(diagKinds(res.diagnostics)).toContain('version-mismatch');
  });

  it('FR-9: a newer-than-known version still parses + emits newer-format', async () => {
    const input = `{"type":"user","uuid":"a","version":"9.9.9","message":{"content":"x"}}`;
    const res = await parseSession(input);
    expect(res.session.formatVersion).toBe('9.9.9');
    expect(diagKinds(res.diagnostics)).toContain('newer-format');
    expect(res.session.events.length).toBe(1);
  });

  it('falls back to unknown when no version present', async () => {
    const res = await parseSession(
      `{"type":"user","uuid":"a","message":{"content":"x"}}`,
    );
    expect(res.session.formatVersion).toBe('unknown');
  });
});

describe('FR-10..FR-15 - event + content mapping', () => {
  it('FR-10/FR-12: user string content → user event with one text block', async () => {
    const res = await parseSession(
      `{"type":"user","uuid":"a","message":{"content":"hello"}}`,
    );
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('user');
    expect((ev as { content: ContentBlock[] }).content).toEqual([
      { type: 'text', text: 'hello' },
    ]);
  });

  it('FR-10: assistant carries model', async () => {
    const input = `{"type":"assistant","uuid":"a","message":{"model":"claude-opus-4-8","content":[{"type":"text","text":"hi"}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('assistant');
    expect((ev as { model?: string }).model).toBe('claude-opus-4-8');
  });

  it('FR-11: one assistant record with N blocks → N events, ids suffixed #0/#1', async () => {
    const input = `{"type":"assistant","uuid":"u1","parentUuid":"p","timestamp":"${TS1}","message":{"model":"m","content":[{"type":"thinking","thinking":"reason","signature":"sig"},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"cmd":"ls"}}]}}`;
    const res = await parseSession(input);
    expect(kinds(res.session.events)).toEqual(['thinking', 'tool_use']);
    expect(res.session.events[0]?.id).toBe('u1#0');
    expect(res.session.events[1]?.id).toBe('u1#1');
  });

  it('FR-13: thinking event preserves signature in raw, not in content', async () => {
    const input = `{"type":"assistant","uuid":"u1","message":{"content":[{"type":"thinking","thinking":"reason here","signature":"SECRET_SIG"}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('thinking');
    expect((ev as { content: ContentBlock[] }).content).toEqual([
      { type: 'text', text: 'reason here' },
    ]);
    // signature lives only in raw.
    expect(JSON.stringify(ev?.raw)).toContain('SECRET_SIG');
    expect(JSON.stringify((ev as { content: ContentBlock[] }).content)).not.toContain(
      'SECRET_SIG',
    );
  });

  it('FR-13: redacted_thinking → thinking event flagged redacted, no plaintext', async () => {
    const input = `{"type":"assistant","uuid":"u1","message":{"content":[{"type":"redacted_thinking","data":"opaque"}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('thinking');
    expect((ev as { redacted?: boolean }).redacted).toBe(true);
    expect((ev as { content: ContentBlock[] }).content).toEqual([]);
  });

  it('FR-14: tool_use → tool_use event with toolId/name/input passthrough', async () => {
    const input = `{"type":"assistant","uuid":"u1","message":{"content":[{"type":"tool_use","id":"toolu_xyz","name":"Read","input":{"path":"/a","n":5}}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('tool_use');
    expect((ev as { toolId?: string }).toolId).toBe('toolu_xyz');
    expect((ev as { name: string }).name).toBe('Read');
    expect((ev as { input: unknown }).input).toEqual({ path: '/a', n: 5 });
  });

  it('FR-15: image block (base64) → image ContentBlock by reference', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"AAAB"}}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('user');
    expect((ev as { content: ContentBlock[] }).content[0]).toEqual({
      type: 'image',
      ref: 'AAAB',
      encoding: 'base64',
      mediaType: 'image/png',
    });
  });

  it('FR-15: image block (url) → image ContentBlock with url encoding', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"image","source":{"type":"url","url":"https://x/y.png"}}]}}`;
    const res = await parseSession(input);
    const block = (res.session.events[0] as { content: ContentBlock[] }).content[0];
    expect(block).toEqual({ type: 'image', ref: 'https://x/y.png', encoding: 'url' });
  });
});

describe('FR-16 / FR-17 - tool_result handling', () => {
  it('FR-16: prefers richer toolUseResult as output, keeps inline in raw', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":false,"content":"flat string"}]},"toolUseResult":{"stdout":"rich","stderr":"","isError":false}}`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(1);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('tool_result');
    expect((ev as { output: unknown }).output).toEqual({
      stdout: 'rich',
      stderr: '',
      isError: false,
    });
    expect((ev as { forToolId?: string }).forToolId).toBe('toolu_1');
    expect((ev as { isError?: boolean }).isError).toBe(false);
    // inline flat string still preserved somewhere in raw.
    expect(JSON.stringify(ev?.raw)).toContain('flat string');
  });

  it('FR-16: is_error true flows through', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"tool_result","tool_use_id":"t","is_error":true,"content":"boom"}]}}`;
    const res = await parseSession(input);
    expect((res.session.events[0] as { isError?: boolean }).isError).toBe(true);
    expect((res.session.events[0] as { output: unknown }).output).toBe('boom');
  });

  it('FR-17: a user record with ONLY tool_result → no user event', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"tool_result","tool_use_id":"t","content":"out"}]}}`;
    const res = await parseSession(input);
    expect(kinds(res.session.events)).toEqual(['tool_result']);
    expect(res.session.events.some((e) => e.kind === 'user')).toBe(false);
  });

  it('FR-17: mixed user text + tool_result → both a user and a tool_result event', async () => {
    const input = `{"type":"user","uuid":"u1","message":{"content":[{"type":"text","text":"see this"},{"type":"tool_result","tool_use_id":"t","content":"out"}]}}`;
    const res = await parseSession(input);
    expect(kinds(res.session.events).sort()).toEqual(['tool_result', 'user']);
  });
});

describe('FR-18 / FR-19 / FR-20 - system, isMeta, session meta', () => {
  it('FR-18: system turn_duration → meta event with subtype', async () => {
    const input = `{"type":"system","subtype":"turn_duration","uuid":"u1","durationMs":1000,"messageCount":3,"timestamp":"${TS1}"}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('meta');
    expect((ev as { subtype?: string }).subtype).toBe('turn_duration');
    expect(JSON.stringify(ev?.raw)).toContain('durationMs');
  });

  it('FR-19: isMeta records flagged meta=true', async () => {
    const input = `{"type":"user","uuid":"u1","isMeta":true,"message":{"content":"caveat"}}`;
    const res = await parseSession(input);
    expect(res.session.events[0]?.meta).toBe(true);
  });

  it('FR-20: ai-title lifted to meta.title and is NOT a conversation turn', async () => {
    const input =
      `{"type":"ai-title","aiTitle":"My Session","sessionId":"s1"}\n` +
      `{"type":"user","uuid":"u1","sessionId":"s1","message":{"content":"hi"}}`;
    const res = await parseSession(input);
    expect(res.session.meta.title).toBe('My Session');
    // ai-title becomes a meta event (recognized, round-tripped), not a user turn.
    const titleEv = res.session.events.find((e) => e.kind === 'meta');
    expect(titleEv).toBeDefined();
    expect(res.session.events.filter((e) => e.kind === 'user').length).toBe(1);
  });

  it('FR-20: file-history-snapshot recognized as a meta event', async () => {
    const input = `{"type":"file-history-snapshot","messageId":"m1","snapshot":{"trackedFileBackups":{}}}`;
    const res = await parseSession(input);
    expect(res.session.events[0]?.kind).toBe('meta');
    expect((res.session.events[0] as { note: string }).note).toBe(
      'file-history-snapshot',
    );
  });
});

describe('FR-21 / FR-22 - unknown type/block preservation', () => {
  it('FR-21: unknown record type → meta event + raw + diagnostic', async () => {
    const input = `{"type":"brand-new-type","uuid":"u1","payload":{"x":1}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('meta');
    expect((ev as { note: string }).note).toBe('brand-new-type');
    expect(JSON.stringify(ev?.raw)).toContain('payload');
    expect(diagKinds(res.diagnostics)).toContain('unknown-event-type');
    expect(res.stats.unknownEventTypes['brand-new-type']).toBe(1);
  });

  it('FR-21: a record with no type → meta event, never dropped', async () => {
    const input = `{"uuid":"u1","mystery":true}`;
    const res = await parseSession(input);
    expect(res.session.events[0]?.kind).toBe('meta');
    expect(res.stats.mappedRecords).toBe(1);
  });

  it('FR-22: unknown content block → raw ContentBlock + diagnostic', async () => {
    const input = `{"type":"assistant","uuid":"u1","message":{"content":[{"type":"weird_block","data":42}]}}`;
    const res = await parseSession(input);
    const ev = res.session.events[0];
    expect(ev?.kind).toBe('assistant');
    const block = (ev as { content: ContentBlock[] }).content[0];
    expect(block?.type).toBe('raw');
    expect(diagKinds(res.diagnostics)).toContain('unknown-block-type');
    expect(res.stats.unknownBlockTypes['weird_block']).toBe(1);
  });
});

describe('FR-23 / FR-30 - id retention + preserveRaw option', () => {
  it('FR-23: event.id is the source uuid; raw kept by default', async () => {
    const res = await parseSession(
      `{"type":"user","uuid":"abc-123","message":{"content":"x"}}`,
    );
    expect(res.session.events[0]?.id).toBe('abc-123');
    expect(res.session.events[0]?.raw).toBeDefined();
  });

  it('FR-30: preserveRaw:false strips raw on known events', async () => {
    const res = await parseSession(
      `{"type":"user","uuid":"abc","message":{"content":"x"}}`,
      {
        preserveRaw: false,
      },
    );
    expect(res.session.events[0]?.raw).toBeUndefined();
  });

  it('FR-30: maxBytes truncates pathological input without throwing', async () => {
    const big =
      `{"type":"user","uuid":"a","message":{"content":"` + 'x'.repeat(10_000) + `"}}`;
    const res = await parseSession(big, { maxBytes: 50 });
    expect(res).toBeDefined();
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('FR-24 - defensive execution / never crash', () => {
  it('a deeply nested + adversarial mixed file still returns a result', async () => {
    const input =
      `{"type":"assistant","uuid":"u1","message":{"content":[{"type":"tool_use","id":"t","name":"X","input":{"a":{"b":{"c":[1,2,3]}}}}]}}\n` +
      `not json at all\n` +
      `{"type":"unknown","uuid":"u2"}\n` +
      `{"type":"user","uuid":"u3","message":{"content":[{"type":"tool_result","tool_use_id":"t","content":"r"}]}}`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBeGreaterThanOrEqual(3);
    expect(res.stats.mappedRecords + res.stats.droppedToDiagnostics).toBe(
      res.stats.parsedRecords,
    );
  });
});

describe('FR-25 / FR-28 - ordering + sidechain laning', () => {
  it('FR-25: DAG order followed (child after parent) despite file order', async () => {
    // child appears BEFORE parent in the file; timestamps reversed too.
    const input =
      `{"type":"assistant","uuid":"child","parentUuid":"root","timestamp":"${TS2}","message":{"content":"a"}}\n` +
      `{"type":"user","uuid":"root","parentUuid":null,"timestamp":"${TS1}","message":{"content":"q"}}`;
    const res = await parseSession(input);
    const ids = res.session.events.map((e) => e.id);
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child'));
  });

  it('FR-25: deterministic ordering for identical input', async () => {
    const input =
      `{"type":"user","uuid":"a","parentUuid":null,"timestamp":"${TS1}","message":{"content":"1"}}\n` +
      `{"type":"user","uuid":"b","parentUuid":"a","timestamp":"${TS2}","message":{"content":"2"}}`;
    const r1 = await parseSession(input);
    const r2 = await parseSession(input);
    expect(r1.session.events.map((e) => e.id)).toEqual(
      r2.session.events.map((e) => e.id),
    );
  });

  it('FR-25: timestamp tiebreak when DAG is flat (no parent links)', async () => {
    const input =
      `{"type":"user","uuid":"later","timestamp":"${TS2}","message":{"content":"2"}}\n` +
      `{"type":"user","uuid":"earlier","timestamp":"${TS1}","message":{"content":"1"}}`;
    const res = await parseSession(input);
    const ids = res.session.events.map((e) => e.id);
    expect(ids.indexOf('earlier')).toBeLessThan(ids.indexOf('later'));
  });

  it('FR-25: cycles / duplicate uuids do not infinite-loop', async () => {
    const input =
      `{"type":"user","uuid":"a","parentUuid":"b","timestamp":"${TS1}","message":{"content":"x"}}\n` +
      `{"type":"user","uuid":"b","parentUuid":"a","timestamp":"${TS2}","message":{"content":"y"}}\n` +
      `{"type":"user","uuid":"a","parentUuid":"b","timestamp":"${TS2}","message":{"content":"dup"}}`;
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(3);
  });

  it('FR-28: sidechain records are laned sidechain:<id>', async () => {
    const input =
      `{"type":"user","uuid":"m","sessionId":"s","isSidechain":false,"timestamp":"${TS1}","message":{"content":"main"}}\n` +
      `{"type":"assistant","uuid":"sc","sessionId":"s","isSidechain":true,"timestamp":"${TS2}","message":{"content":"sub"}}`;
    const res = await parseSession(input);
    const main = res.session.events.find((e) => e.id === 'm');
    const side = res.session.events.find((e) => e.id === 'sc');
    expect(main?.lane).toBe('main');
    expect(side?.lane).toBe('sidechain:s');
  });
});

describe('FR-26 / FR-27 - timestamp normalization + bounds', () => {
  it('FR-26: invalid/missing timestamps → undefined, never Invalid Date', async () => {
    const input =
      `{"type":"user","uuid":"a","timestamp":"not-a-date","message":{"content":"x"}}\n` +
      `{"type":"user","uuid":"b","message":{"content":"y"}}`;
    const res = await parseSession(input);
    for (const e of res.session.events) {
      if (e.ts !== undefined) {
        expect(new Date(e.ts).toISOString()).toBe(e.ts);
      } else {
        expect(e.ts).toBeUndefined();
      }
    }
    expect(diagKinds(res.diagnostics)).toContain('missing-timestamp');
  });

  it('FR-26: valid ISO normalized to canonical UTC', async () => {
    const input = `{"type":"user","uuid":"a","timestamp":"2026-06-13T13:00:35.997+02:00","message":{"content":"x"}}`;
    const res = await parseSession(input);
    expect(res.session.events[0]?.ts).toBe('2026-06-13T11:00:35.997Z');
  });

  it('FR-27: startedAt = earliest, endedAt = latest valid ts', async () => {
    const input =
      `{"type":"user","uuid":"a","timestamp":"${TS2}","message":{"content":"2"}}\n` +
      `{"type":"user","uuid":"b","timestamp":"${TS1}","message":{"content":"1"}}`;
    const res = await parseSession(input);
    expect(res.session.meta.startedAt).toBe(TS1);
    expect(res.session.meta.endedAt).toBe(TS2);
  });
});

describe('FR-31 - schema version stamping', () => {
  it('stamps schemaVersion on every result', async () => {
    const res = await parseSession('');
    expect(res.schemaVersion).toBe('1');
    expect(SCHEMA_VERSION).toBe('1');
  });
});

describe('large input stress (FR-29/FR-30) - generated, not committed', () => {
  it('parses a multi-MB synthetic session without throwing', async () => {
    const lines: string[] = [];
    let i = 0;
    let approxLen = 0;
    // Build until > ~3MB. Track length incrementally - re-joining the whole array
    // each iteration to measure it is O(n^2) and made this test flaky.
    while (approxLen < 3_000_000) {
      const uuid = `u${i}`;
      const parent = i === 0 ? null : `u${i - 1}`;
      const line = JSON.stringify({
        type: i % 2 === 0 ? 'user' : 'assistant',
        uuid,
        parentUuid: parent,
        timestamp: new Date(1_700_000_000_000 + i * 1000).toISOString(),
        version: '2.1.177',
        message: {
          content: i % 2 === 0 ? `prompt ${i}` : [{ type: 'text', text: `reply ${i}` }],
        },
      });
      lines.push(line);
      approxLen += line.length + 1; // +1 for the join newline
      i++;
    }
    const input = lines.join('\n');
    expect(input.length).toBeGreaterThan(3_000_000);
    const res = await parseSession(input);
    expect(res.session.events.length).toBe(lines.length);
    expect(res.stats.mappedRecords + res.stats.droppedToDiagnostics).toBe(
      res.stats.parsedRecords,
    );
  });
});
