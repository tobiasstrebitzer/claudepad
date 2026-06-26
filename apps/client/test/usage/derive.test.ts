// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateFile } from '@/usage/aggregate';
import { buildDashboard, DEFAULT_SETTINGS } from '@/usage/derive';

function u(p: Partial<TokenUsage>): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...p };
}
function assistant(ts: string, model: string, usage: TokenUsage): SessionEvent {
  return { kind: 'assistant', model, content: [], ts, usage };
}
function fileOf(id: string, cwd: string, events: SessionEvent[]) {
  const session: Session = { id, source: 'claude-code', formatVersion: 'unknown', meta: { cwd }, events };
  return aggregateFile(session);
}

const FILES = [
  fileOf('a1', '/work/alpha', [assistant('2026-06-10T09:00:00.000Z', 'claude-opus-4-8', u({ input: 1000, output: 500 }))]),
  fileOf('a2', '/work/alpha', [assistant('2026-06-12T14:00:00.000Z', 'claude-haiku-4-5', u({ output: 200, cacheRead: 5000 }))]),
  fileOf('b1', '/work/beta', [assistant('2026-05-20T11:00:00.000Z', 'claude-opus-4-8', u({ input: 300, output: 100 }))]),
];

describe('PRD-13 FR-9..14: buildDashboard', () => {
  it('summarizes the whole vault by default', () => {
    const v = buildDashboard(FILES, DEFAULT_SETTINGS);
    expect(v.sessionCount).toBe(3);
    expect(v.projectCount).toBe(2);
    expect(v.totals.output).toBe(800);
    expect(v.activeDays).toBe(3); // three distinct local days
    expect(v.projects.map((p) => p.project)).toEqual(['/work/alpha', '/work/beta']); // alpha has more tokens
    expect(v.topModel?.model).toBeTruthy();
    expect(v.models.length).toBe(2);
    expect(v.cost.total).toBeGreaterThan(0);
    expect(v.effortHours).toBeCloseTo(800 / 4000);
  });

  it('re-scopes every figure to a selected project', () => {
    const v = buildDashboard(FILES, DEFAULT_SETTINGS, { project: '/work/beta' });
    expect(v.sessionCount).toBe(1);
    expect(v.projectCount).toBe(1);
    expect(v.totals.output).toBe(100);
    // The project table still lists ALL projects (so the column is stable).
    expect(v.projects.length).toBe(2);
  });

  it('applies an exact day range to every figure', () => {
    const all = buildDashboard(FILES, DEFAULT_SETTINGS);
    expect(all.series.length).toBe(3);
    // Window that captures only the June 10 session.
    const win = buildDashboard(FILES, DEFAULT_SETTINGS, { fromDay: '2026-06-01', toDay: '2026-06-11' });
    expect(win.series.length).toBe(1);
    expect(win.sessionCount).toBe(1);
    expect(win.totals.output).toBe(500);
    expect(win.projectCount).toBe(1);
  });

  it('computes Real Spend only when a subscription is set, labeled an allocation', () => {
    const off = buildDashboard(FILES, DEFAULT_SETTINGS);
    expect(off.realSpendTotal).toBe(0);
    const on = buildDashboard(FILES, { ...DEFAULT_SETTINGS, monthlySubscription: 30 });
    // Two active months (May + June) -> 2 x $30 allocated.
    expect(on.realSpendTotal).toBeCloseTo(60);
    const sum = on.projects.reduce((n, p) => n + p.realSpend, 0);
    expect(sum).toBeCloseTo(60);
  });
});
