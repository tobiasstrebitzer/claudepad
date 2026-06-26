// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSession } from '@/schema';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateSession, aggregateVault, totalTokens } from '@/usage/aggregate';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'schema', 'fixtures');

function u(partial: Partial<TokenUsage>): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...partial };
}

function assistant(ts: string, model: string, usage: TokenUsage): SessionEvent {
  return { kind: 'assistant', model, content: [], ts, usage };
}

function session(events: SessionEvent[], meta: Partial<Session['meta']> = {}): Session {
  return {
    id: 's1',
    source: 'claude-code',
    formatVersion: 'unknown',
    meta: { ...meta },
    events,
  };
}

describe('PRD-13 FR-2: aggregateSession', () => {
  it('sums totals and splits by model', () => {
    const s = session(
      [
        assistant('2026-06-20T10:00:00.000Z', 'claude-opus-4-8', u({ input: 100, output: 50, cacheRead: 1000 })),
        assistant('2026-06-20T10:00:05.000Z', 'claude-opus-4-8', u({ input: 10, output: 5 })),
        assistant('2026-06-20T10:00:07.000Z', 'claude-haiku-4-5', u({ input: 8, output: 4, cacheCreate: 200 })),
      ],
      { cwd: '/Users/dev/proj', title: 'T', model: 'claude-opus-4-8' },
    );
    const a = aggregateSession(s);
    expect(a.totals).toMatchObject({ input: 118, output: 59, cacheRead: 1000, cacheCreate: 200 });
    expect(a.messages).toBe(3);
    expect(totalTokens(a.byModel['claude-opus-4-8']!)).toBe(100 + 50 + 1000 + 10 + 5);
    expect(totalTokens(a.byModel['claude-haiku-4-5']!)).toBe(8 + 4 + 200);
    expect(a.model).toBe('claude-opus-4-8');
    expect(a.cwd).toBe('/Users/dev/proj');
    expect(a.firstAt).toBe('2026-06-20T10:00:00.000Z');
    expect(a.lastAt).toBe('2026-06-20T10:00:07.000Z');
  });

  it('idle-collapses active wall-clock (gaps over 20s excluded)', () => {
    const s = session([
      assistant('2026-06-20T10:00:00.000Z', 'm', u({ output: 1 })), // +5s gap
      assistant('2026-06-20T10:00:05.000Z', 'm', u({ output: 1 })), // +55s idle gap (excluded)
      assistant('2026-06-20T10:01:00.000Z', 'm', u({ output: 1 })), // +2s gap
      assistant('2026-06-20T10:01:02.000Z', 'm', u({ output: 1 })),
    ]);
    expect(aggregateSession(s).activeMs).toBe(7000); // 5s + 2s, the 55s idle dropped
  });

  it('attributes a tool-only turn (no model on carrier) to the dominant model', () => {
    const toolTurn: SessionEvent = {
      kind: 'tool_use',
      name: 'Bash',
      input: {},
      ts: '2026-06-20T10:00:00.000Z',
      usage: u({ input: 5, output: 0, cacheRead: 500 }),
    };
    const a = aggregateSession(session([toolTurn], { model: 'claude-opus-4-8' }));
    expect(a.messages).toBe(1);
    expect(totalTokens(a.byModel['claude-opus-4-8']!)).toBe(505);
  });
});

describe('PRD-13 FR-3: aggregateVault', () => {
  it('keys projects by cwd, buckets days/hours, and conserves totals', () => {
    const s1 = session(
      [assistant('2026-06-20T10:00:00.000Z', 'm', u({ input: 100, output: 10 }))],
      { cwd: '/a' },
    );
    const s2 = session(
      [assistant('2026-06-21T11:00:00.000Z', 'm', u({ input: 50, output: 5 }))],
      { cwd: '/b' },
    );
    const s3 = session(
      [assistant('2026-06-21T12:00:00.000Z', 'm', u({ input: 25, output: 2 }))],
      { cwd: '/a' },
    );
    const vault = aggregateVault(
      [s1, s2, s3].map((s) => ({ usage: aggregateSession(s), session: s })),
    );

    // Global conserves the sum of all turns.
    expect(vault.global.totals.input).toBe(175);
    expect(vault.global.totals.output).toBe(17);
    expect(vault.global.sessions).toBe(3);

    // Two projects; /a has two sessions and more tokens, sorted first.
    expect(vault.projects.map((p) => p.project)).toEqual(['/a', '/b']);
    expect(vault.projects[0]!.sessions).toBe(2);

    // byDay conserves the global total (tz-agnostic: same Date API both sides).
    const daySum = Object.values(vault.byDay).reduce((n, d) => n + totalTokens(d.totals), 0);
    expect(daySum).toBe(totalTokens(vault.global.totals));

    // Per-project monthly buckets also conserve each project's total.
    const aMonths = vault.byProjectMonth['/a']!;
    const aMonthSum = Object.values(aMonths).reduce((n, b) => n + totalTokens(b.totals), 0);
    const aProject = vault.projects.find((p) => p.project === '/a')!;
    expect(aMonthSum).toBe(totalTokens(aProject.totals));

    // Weekday/hour grid counts each usage-bearing message exactly once.
    const gridCount = vault.byWeekdayHour.flat().reduce((n, c) => n + c, 0);
    expect(gridCount).toBe(3);
  });

  it('clips to an exact day range across every figure', () => {
    const s1 = session([assistant('2026-06-10T10:00:00.000Z', 'm', u({ output: 100 }))], { cwd: '/a' });
    const s2 = session([assistant('2026-06-15T10:00:00.000Z', 'm', u({ output: 40 }))], { cwd: '/a' });
    const s3 = session([assistant('2026-06-20T10:00:00.000Z', 'm', u({ output: 7 }))], { cwd: '/b' });
    const v = aggregateVault([s1, s2, s3].map((s) => ({ session: s })), {
      fromDay: '2026-06-12',
      toDay: '2026-06-18',
    });
    // Only the 06-15 session falls inside [06-12, 06-18].
    expect(v.global.totals.output).toBe(40);
    expect(v.global.sessions).toBe(1);
    expect(v.projects.map((p) => p.project)).toEqual(['/a']);
    expect(Object.keys(v.byDay)).toEqual(['2026-06-15']);
    expect(v.sessions.map((s) => s.totals.output)).toEqual([40]);
  });

  it('runs over the real corpus and conserves DEDUPED token totals end to end', async () => {
    const files = readdirSync(fixturesDir).filter((f) => f.startsWith('real-') && f.endsWith('.jsonl'));
    const parsed: { usage: ReturnType<typeof aggregateSession>; session: Session }[] = [];
    // Independent ground truth: dedup turns by usageKey across the whole corpus
    // (the exact key Claude Code copies into resumed/sidechain files), exactly as
    // the roll-up must - summing every event instead would double-count.
    const seen = new Set<string>();
    let dedupOutput = 0;
    let summedOutput = 0;
    let uniq = 0;
    for (const f of files) {
      const text = readFileSync(join(fixturesDir, f), 'utf8');
      const { session: sess } = await parseSession(text);
      parsed.push({ usage: aggregateSession(sess), session: sess });
      for (const e of sess.events) {
        if (!e.usage) continue;
        summedOutput += e.usage.output;
        if (e.usageKey !== undefined) {
          if (seen.has(e.usageKey)) continue;
          seen.add(e.usageKey);
        }
        dedupOutput += e.usage.output;
        uniq += 1;
      }
    }
    // The corpus genuinely contains cross-file copies, so dedup is load-bearing.
    expect(uniq).toBeGreaterThan(0);
    expect(dedupOutput).toBeLessThan(summedOutput);

    const vault = aggregateVault(parsed);
    expect(vault.global.totals.output).toBe(dedupOutput);
    // Project attribution partitions the deduped turns - it still sums to global.
    const projectOutput = vault.projects.reduce((n, p) => n + p.totals.output, 0);
    expect(projectOutput).toBe(dedupOutput);
  });

  it('deduplicates a turn copied across resumed/sidechain files (counts it once)', () => {
    // Same usageKey in two files (a resume snapshot): a naive sum would
    // double-count; the roll-up must count its tokens exactly once.
    const dup = (ts: string): SessionEvent => ({
      kind: 'assistant',
      model: 'm',
      content: [],
      ts,
      usage: u({ input: 100, output: 20, cacheRead: 5000 }),
      usageKey: 'msg_abc:req_1',
    });
    const original = session([dup('2026-06-20T10:00:00.000Z')], { cwd: '/a' });
    const resume = session(
      [
        dup('2026-06-20T10:00:00.000Z'), // the carried-forward copy
        { kind: 'assistant', model: 'm', content: [], ts: '2026-06-20T10:05:00.000Z', usage: u({ output: 7 }), usageKey: 'msg_new:req_2' },
      ],
      { cwd: '/a' },
    );
    const vault = aggregateVault([original, resume].map((s) => ({ session: s })));
    // 5000 cache-read counted once (not 10000); only the genuinely new turn adds on.
    expect(vault.global.totals.cacheRead).toBe(5000);
    expect(vault.global.totals.output).toBe(27);
    // Heatmap counts each distinct turn once, not the copy.
    expect(vault.byWeekdayHour.flat().reduce((n, c) => n + c, 0)).toBe(2);
  });

  it('never dedups keyless turns (no message.id -> counted as-is)', () => {
    // Two turns with identical tokens but no usageKey are distinct work, kept both.
    const noKey = (ts: string): SessionEvent => ({ kind: 'assistant', model: 'm', content: [], ts, usage: u({ output: 10 }) });
    const vault = aggregateVault([
      { session: session([noKey('2026-06-20T10:00:00.000Z')], { cwd: '/a' }) },
      { session: session([noKey('2026-06-20T11:00:00.000Z')], { cwd: '/a' }) },
    ]);
    expect(vault.global.totals.output).toBe(20);
  });
});
