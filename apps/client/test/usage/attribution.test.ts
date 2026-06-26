// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateSession, aggregateVault } from '@/usage/aggregate';
import { attributeSpend } from '@/usage/attribution';
import { effortHours, DEFAULT_EFFORT, effortFormula } from '@/usage/effort';

function u(p: Partial<TokenUsage>): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...p };
}
function assistant(ts: string, usage: TokenUsage): SessionEvent {
  return { kind: 'assistant', model: 'claude-opus-4-8', content: [], ts, usage };
}
function session(id: string, cwd: string, events: SessionEvent[]): Session {
  return { id, source: 'claude-code', formatVersion: 'unknown', meta: { cwd }, events };
}

function vaultOf(...sessions: Session[]) {
  return aggregateVault(sessions.map((s) => ({ usage: aggregateSession(s), session: s })));
}

describe('PRD-13 FR-7: Real Spend attribution', () => {
  it('splits a month by token share and sums to the subscription amount', () => {
    // One month, two projects: /a has 3x the output of /b -> 75/25 split.
    const vault = vaultOf(
      session('s1', '/a', [assistant('2026-06-10T10:00:00.000Z', u({ output: 300 }))]),
      session('s2', '/b', [assistant('2026-06-11T10:00:00.000Z', u({ output: 100 }))]),
    );
    const alloc = attributeSpend(vault, { monthlyAmount: 100, weight: 'tokens' });
    expect(alloc.byProject['/a']).toBeCloseTo(75);
    expect(alloc.byProject['/b']).toBeCloseTo(25);
    expect(alloc.totalAllocated).toBeCloseTo(100);
    expect(alloc.activeMonths).toEqual(['2026-06']);
  });

  it('charges each active month, so a two-month vault allocates 2x the monthly amount', () => {
    const vault = vaultOf(
      session('s1', '/a', [assistant('2026-05-10T10:00:00.000Z', u({ output: 100 }))]),
      session('s2', '/a', [assistant('2026-06-10T10:00:00.000Z', u({ output: 100 }))]),
    );
    const alloc = attributeSpend(vault, { monthlyAmount: 20, weight: 'tokens' });
    expect(alloc.totalAllocated).toBeCloseTo(40);
    expect(alloc.byProject['/a']).toBeCloseTo(40);
    expect(alloc.activeMonths).toEqual(['2026-05', '2026-06']);
  });

  it('respects a month range filter', () => {
    const vault = vaultOf(
      session('s1', '/a', [assistant('2026-05-10T10:00:00.000Z', u({ output: 100 }))]),
      session('s2', '/a', [assistant('2026-06-10T10:00:00.000Z', u({ output: 100 }))]),
    );
    const alloc = attributeSpend(vault, { monthlyAmount: 20, weight: 'tokens', fromMonth: '2026-06' });
    expect(alloc.activeMonths).toEqual(['2026-06']);
    expect(alloc.totalAllocated).toBeCloseTo(20);
  });

  it('cost weighting differs from token weighting when cache mix differs', () => {
    // /a is all cheap cache reads; /b is all expensive output. Same token count,
    // but cost share heavily favours /b.
    const vault = vaultOf(
      session('s1', '/a', [assistant('2026-06-10T10:00:00.000Z', u({ cacheRead: 1000 }))]),
      session('s2', '/b', [assistant('2026-06-11T10:00:00.000Z', u({ output: 1000 }))]),
    );
    const byCost = attributeSpend(vault, { monthlyAmount: 100, weight: 'cost' });
    const byTokens = attributeSpend(vault, { monthlyAmount: 100, weight: 'tokens' });
    expect(byTokens.byProject['/a']).toBeCloseTo(50); // equal tokens
    expect(byCost.byProject['/b']!).toBeGreaterThan(byCost.byProject['/a']!); // output costs more
  });
});

describe('PRD-13 FR-8: effort equivalent', () => {
  it('scales output tokens by the authoring rate', () => {
    expect(effortHours(DEFAULT_EFFORT.outputTokensPerHour)).toBeCloseTo(1);
    expect(effortHours(8000, { outputTokensPerHour: 4000 })).toBeCloseTo(2);
  });

  it('guards against a zero/invalid rate', () => {
    expect(effortHours(4000, { outputTokensPerHour: 0 })).toBeCloseTo(1);
  });

  it('exposes an editable formula string', () => {
    expect(effortFormula({ outputTokensPerHour: 4000 })).toContain('4,000');
  });
});
