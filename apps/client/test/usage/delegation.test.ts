// @vitest-environment node
//
// Delegated subagent runs and the parallelism metric. The two are tangled on
// purpose: a subagent runs *inside* its parent's wall-clock, so the same fold
// that must count its tokens must not count it as a session or as a second
// thing running at once.

import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateFile, rollupVault, totalTokens } from '@/usage/aggregate';
import { computeConcurrency, SLOT_MS, busyHours } from '@/usage/concurrency';
import { buildDashboard, DEFAULT_SETTINGS } from '@/usage/derive';
import type { AgentRunInfo, FileAggregate } from '@/usage/types';

function u(partial: Partial<TokenUsage> = {}): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...partial };
}

let seq = 0;
function assistant(ts: string, usage: TokenUsage = u({ output: 100 })): SessionEvent {
  return {
    kind: 'assistant',
    model: 'claude-opus-5',
    content: [],
    ts,
    usage,
    usageKey: `msg-${++seq}`,
  };
}

function session(id: string, events: SessionEvent[], cwd = '/proj/a'): Session {
  return { id, source: 'claude-code', formatVersion: 'unknown', meta: { cwd }, events };
}

function agent(id: string, agentType: string, parentSessionId = 'main'): AgentRunInfo {
  return { agentId: id, parentSessionId, agentType };
}

/** Turns every `minutes` apart, starting at `startIso`. */
function everyMinute(startIso: string, count: number, stepMin = 1): SessionEvent[] {
  const t0 = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) =>
    assistant(new Date(t0 + i * stepMin * 60_000).toISOString()),
  );
}

describe('delegated subagent runs are counted as spend, not as sessions', () => {
  const main = aggregateFile(session('main', [assistant('2026-06-20T10:00:00.000Z', u({ output: 100 }))]));
  const sub = aggregateFile(
    session('agent-1', [assistant('2026-06-20T10:00:30.000Z', u({ output: 900 }))]),
    agent('agent-1', 'Explore'),
  );

  it('sums subagent tokens into the totals', () => {
    const v = rollupVault([main, sub]);
    expect(totalTokens(v.global.totals)).toBe(1000);
    expect(totalTokens(v.delegated)).toBe(900);
  });

  it('counts the run in agentRuns, never in sessions', () => {
    const v = rollupVault([main, sub]);
    expect(v.global.sessions).toBe(1);
    expect(v.agentRuns).toBe(1);
    expect(v.sessions).toHaveLength(1);
    expect(v.sessions[0]!.sessionId).toBe('main');
  });

  it('keeps the tokens-per-session histogram about sessions', () => {
    // Regression: folding a 900-token agent run in as a "session" would report
    // two sessions averaging 500 tokens, when one session did 1000.
    const view = buildDashboard([main, sub], DEFAULT_SETTINGS);
    expect(view.sessionTokens).toEqual([100]);
    expect(view.sessionCount).toBe(1);
  });

  it('splits delegated work by agent type', () => {
    const other = aggregateFile(
      session('agent-2', [assistant('2026-06-20T10:01:00.000Z', u({ output: 50 }))]),
      agent('agent-2', 'fable'),
    );
    const v = rollupVault([main, sub, other]);
    expect(totalTokens(v.byAgentType['Explore']!.totals)).toBe(900);
    expect(totalTokens(v.byAgentType['fable']!.totals)).toBe(50);
    expect(v.byAgentType['(agent)']).toBeUndefined();
  });

  it('labels a run whose sidecar was missing rather than dropping it', () => {
    const untyped = aggregateFile(
      session('agent-3', [assistant('2026-06-20T10:02:00.000Z', u({ output: 7 }))]),
      { agentId: 'agent-3', parentSessionId: 'main' },
    );
    const v = rollupVault([untyped]);
    expect(totalTokens(v.byAgentType['(agent)']!.totals)).toBe(7);
    expect(v.agentRuns).toBe(1);
  });

  it('reports the delegated share and fan-out on the dashboard', () => {
    const view = buildDashboard([main, sub], DEFAULT_SETTINGS);
    expect(view.delegation.share).toBeCloseTo(0.9);
    expect(view.delegation.runs).toBe(1);
    expect(view.delegation.runsPerSession).toBe(1);
    expect(view.delegation.types.map((t) => t.agentType)).toEqual(['Explore']);
  });

  it('excludes an out-of-range run from both tokens and the run count', () => {
    const v = rollupVault([main, sub], { fromDay: '2026-07-01' });
    expect(v.agentRuns).toBe(0);
    expect(totalTokens(v.delegated)).toBe(0);
  });
});

describe('parallelism: how many sessions ran at once', () => {
  it('is 1x when sessions run strictly back to back', () => {
    const a = aggregateFile(session('a', everyMinute('2026-06-20T10:00:00.000Z', 10)));
    const b = aggregateFile(session('b', everyMinute('2026-06-20T12:00:00.000Z', 10)));
    const v = rollupVault([a, b]);
    expect(v.concurrency.mean).toBe(1);
    expect(v.concurrency.max).toBe(1);
  });

  it('is 2x when two sessions overlap for their whole span', () => {
    const a = aggregateFile(session('a', everyMinute('2026-06-20T10:00:00.000Z', 30)));
    const b = aggregateFile(session('b', everyMinute('2026-06-20T10:00:00.000Z', 30), '/proj/b'));
    const v = rollupVault([a, b]);
    expect(v.concurrency.mean).toBeCloseTo(2);
    expect(v.concurrency.max).toBe(2);
  });

  it('weights the mean by time, not by session count', () => {
    // `a` runs an hour alone; `b` overlaps only its last ~5 minutes. A naive
    // "2 sessions today" reading would say 2x; time-weighted is barely over 1.
    const a = aggregateFile(session('a', everyMinute('2026-06-20T10:00:00.000Z', 60)));
    const b = aggregateFile(session('b', everyMinute('2026-06-20T10:55:00.000Z', 5), '/proj/b'));
    const v = rollupVault([a, b]);
    expect(v.concurrency.max).toBe(2);
    expect(v.concurrency.mean).toBeGreaterThan(1);
    expect(v.concurrency.mean).toBeLessThan(1.2);
  });

  it('does not let subagents inflate session parallelism', () => {
    // Five agents fanned out inside one session is fan-out, not multitasking.
    const main = aggregateFile(session('main', everyMinute('2026-06-20T10:00:00.000Z', 20)));
    const subs = Array.from({ length: 5 }, (_, i) =>
      aggregateFile(
        session(`agent-${i}`, everyMinute('2026-06-20T10:00:00.000Z', 20)),
        agent(`agent-${i}`, 'Explore'),
      ),
    );
    const v = rollupVault([main, ...subs]);
    expect(v.concurrency.mean).toBe(1);
    expect(v.concurrency.max).toBe(1);
    // ...but the fan-out itself is still visible.
    expect(v.concurrency.maxAgents).toBe(5);
  });

  it('does not bridge an overnight gap into "still running"', () => {
    const a = aggregateFile(
      session('a', [
        assistant('2026-06-20T10:00:00.000Z'),
        assistant('2026-06-21T10:00:00.000Z'),
      ]),
    );
    // Two turns 24h apart occupy two slots, not 288 of them.
    expect(a.records).toHaveLength(2);
    const v = rollupVault([a]);
    expect(v.concurrency.busySlots).toBe(2);
  });

  it('bridges the thinking time between two nearby turns', () => {
    const stats = computeConcurrency([
      { id: 'a', ts: [Date.parse('2026-06-20T10:00:00.000Z'), Date.parse('2026-06-20T10:04:00.000Z')] },
    ]);
    // Both turns are inside the bridge window, so the slots between them count.
    expect(stats.busySlots).toBeGreaterThanOrEqual(1);
    expect(busyHours(stats)).toBeCloseTo((stats.busySlots * SLOT_MS) / 3_600_000);
  });

  it('buckets working time by concurrency level for the histogram', () => {
    const a = aggregateFile(session('a', everyMinute('2026-06-20T10:00:00.000Z', 30)));
    const b = aggregateFile(session('b', everyMinute('2026-06-20T10:00:00.000Z', 15), '/proj/b'));
    const view = buildDashboard([a, b], DEFAULT_SETTINGS);
    const total = view.parallelism.shares.reduce((n, s) => n + s.share, 0);
    expect(total).toBeCloseTo(1);
    expect(view.parallelism.shares.map((s) => s.level)).toContain(2);
    expect(view.parallelism.soloShare).toBeGreaterThan(0);
  });

  it('is empty, not NaN, with no activity', () => {
    const view = buildDashboard([] as FileAggregate[], DEFAULT_SETTINGS);
    expect(view.parallelism.mean).toBe(0);
    expect(view.parallelism.shares).toEqual([]);
    expect(view.delegation.share).toBe(0);
    expect(view.delegation.runsPerSession).toBe(0);
  });
});

describe('rate-limit rejections', () => {
  function limitEvent(ts: string, resetsAt: number): SessionEvent {
    return {
      kind: 'assistant',
      model: '<synthetic>',
      content: [],
      ts,
      limit: { type: 'five_hour', status: 'rejected', resetsAt, httpStatus: 429 },
    };
  }

  it('collapses one wall into a single incident across every blocked session', () => {
    // A five-hour wall rejects the main session and each subagent in flight;
    // three raw records, one thing that actually happened.
    const resets = 1788323400;
    const a = aggregateFile(session('a', [limitEvent('2026-09-02T04:18:44.000Z', resets)]));
    const b = aggregateFile(session('b', [limitEvent('2026-09-02T04:18:46.000Z', resets)], '/proj/b'));
    const sub = aggregateFile(
      session('agent-1', [limitEvent('2026-09-02T04:18:45.000Z', resets)]),
      agent('agent-1', 'Explore'),
    );
    const view = buildDashboard([a, b, sub], DEFAULT_SETTINGS);
    expect(view.limits.events).toHaveLength(3);
    expect(view.limits.incidents).toBe(1);
    expect(view.limits.byType['five_hour']).toBe(3);
    expect(view.limits.daysHit).toBe(1);
  });

  it('reports nothing when no limit was hit', () => {
    const a = aggregateFile(session('a', [assistant('2026-06-20T10:00:00.000Z')]));
    const view = buildDashboard([a], DEFAULT_SETTINGS);
    expect(view.limits.incidents).toBe(0);
    expect(view.limits.events).toEqual([]);
  });

  it('honours the date filter', () => {
    const a = aggregateFile(session('a', [limitEvent('2026-09-02T04:18:44.000Z', 1788323400)]));
    const view = buildDashboard([a], DEFAULT_SETTINGS, { fromDay: '2026-09-03' });
    expect(view.limits.incidents).toBe(0);
  });
});
