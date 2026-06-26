// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSession } from '@/schema';
import type { SessionEvent, TokenUsage } from '@/schema';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

const realFixtures = readdirSync(fixturesDir).filter(
  (f) => f.startsWith('real-') && f.endsWith('.jsonl'),
);

/** Sum a token field across every parsed event that carries lifted usage. */
function sumEvents(events: SessionEvent[], pick: (u: TokenUsage) => number): number {
  let total = 0;
  for (const e of events) if (e.usage) total += pick(e.usage);
  return total;
}

/** Independent ground-truth: sum a usage field straight from the raw JSONL. */
function sumRaw(text: string, key: string): { total: number; records: number } {
  let total = 0;
  let records = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const r = rec as Record<string, unknown>;
    if (r['type'] !== 'assistant') continue;
    const message = r['message'] as Record<string, unknown> | undefined;
    const usage = message?.['usage'] as Record<string, unknown> | undefined;
    if (!usage) continue;
    records += 1;
    const v = usage[key];
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return { total, records };
}

describe('PRD-13 FR-1: lifted TokenUsage', () => {
  for (const file of realFixtures) {
    const text = readFileSync(join(fixturesDir, file), 'utf8');

    it(`lifts usage once per assistant record without double-counting (${file})`, async () => {
      const { session } = await parseSession(text);

      // Each token kind sums to the independent raw total - proves usage is
      // attached exactly once per source record (no per-content-block dupes).
      for (const [key, pick] of [
        ['input_tokens', (u: TokenUsage) => u.input],
        ['output_tokens', (u: TokenUsage) => u.output],
        ['cache_creation_input_tokens', (u: TokenUsage) => u.cacheCreate],
        ['cache_read_input_tokens', (u: TokenUsage) => u.cacheRead],
      ] as const) {
        const raw = sumRaw(text, key);
        expect(sumEvents(session.events, pick)).toBe(raw.total);
      }

      // The number of events carrying usage equals the number of usage-bearing
      // assistant records (once-per-record invariant, incl. tool-only turns).
      const withUsage = session.events.filter((e) => e.usage).length;
      expect(withUsage).toBe(sumRaw(text, 'output_tokens').records);
    });
  }

  it('captures the ephemeral cache split and service tier when present', async () => {
    const all: SessionEvent[] = [];
    for (const f of realFixtures) {
      const { session } = await parseSession(readFileSync(join(fixturesDir, f), 'utf8'));
      all.push(...session.events);
    }
    const split = all.find((e) => e.usage?.cacheCreate1h !== undefined);
    expect(split?.usage?.cacheCreate1h, 'an event with the ephemeral 1h split').toBeGreaterThanOrEqual(0);
    const tiered = all.find((e) => e.usage?.serviceTier);
    expect(typeof tiered?.usage?.serviceTier).toBe('string');
  });

  it('lifts a usageKey (message.id) onto each usage-bearing turn for cross-file dedup', async () => {
    for (const file of realFixtures) {
      const text = readFileSync(join(fixturesDir, file), 'utf8');
      const { session } = await parseSession(text);
      // Every real assistant usage record carries a message.id, so every lifted
      // usage event gets the key the roll-up dedups on.
      for (const e of session.events) {
        if (e.usage) expect(typeof e.usageKey, `usageKey on ${file}`).toBe('string');
      }
    }
  });

  it('derives usageKey from message.id (+requestId when present)', async () => {
    const withReq = JSON.stringify({
      type: 'assistant',
      uuid: 'u1',
      requestId: 'req_xyz',
      message: { id: 'msg_123', role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'text', text: 'hi' }], usage: { output_tokens: 1 } },
    });
    const noReq = JSON.stringify({
      type: 'assistant',
      uuid: 'u2',
      message: { id: 'msg_456', role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'text', text: 'hi' }], usage: { output_tokens: 1 } },
    });
    const a = (await parseSession(withReq)).session.events.find((e) => e.usage);
    const b = (await parseSession(noReq)).session.events.find((e) => e.usage);
    expect(a?.usageKey).toBe('msg_123:req_xyz');
    expect(b?.usageKey).toBe('msg_456');
  });

  it('parses sessions without usage blocks (tolerant of absence)', async () => {
    const minimal = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'hi' }] },
    });
    const { session } = await parseSession(minimal);
    expect(session.events.length).toBeGreaterThan(0);
    expect(session.events.every((e) => e.usage === undefined)).toBe(true);
  });
});
