// @vitest-environment node
//
// Rate-limit accounting. The load-bearing claim is that cache reads are free to
// the meter - get that wrong and every number here is off by ~4x for a heavy
// agentic user, in the direction that makes people think limits are arbitrary.

import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateFile } from '@/usage/aggregate';
import { costOf, meteredCost } from '@/usage/pricing';
import {
  MAX_20X,
  SESSION_WINDOW_MS,
  WEEK_MS,
  buildQuota,
  forecastWeek,
  meteredSpend,
  modelFamily,
  sessionWindows,
  weekStart,
  weeklyWindows,
  type QuotaPlan,
} from '@/usage/quota';
import { calibrate, calibratedPlan, parseQuotaLog, windowsOf } from '@/usage/quotaLog';
import { dedupedRecords } from '@/usage/aggregate';
import type { FileAggregate } from '@/usage/types';

function u(p: Partial<TokenUsage> = {}): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...p };
}

let seq = 0;
function turn(ts: string, usage: TokenUsage, model = 'claude-opus-5'): SessionEvent {
  return { kind: 'assistant', model, content: [], ts, usage, usageKey: `m${++seq}` };
}
function file(events: SessionEvent[]): FileAggregate {
  const s: Session = {
    id: `s${++seq}`, source: 'claude-code', formatVersion: 'unknown',
    meta: { cwd: '/proj' }, events,
  };
  return aggregateFile(s);
}
const recs = (f: FileAggregate[]) => dedupedRecords(f);

describe('cache reads are free to the meter', () => {
  it('excludes cache reads from metered cost but keeps them in API cost', () => {
    // 1M cache read on Opus is $0.50 of API cost and $0 of quota.
    const c = costOf(u({ output: 1e6, cacheRead: 1e6 }), 'claude-opus-5');
    expect(c.total).toBeCloseTo(25.5);
    expect(meteredCost(c)).toBeCloseTo(25);
  });

  it('counts fresh input, output and cache writes', () => {
    const c = costOf(u({ input: 1e6, output: 1e6, cacheCreate: 1e6 }), 'claude-opus-5');
    expect(meteredCost(c)).toBeCloseTo(5 + 25 + 6.25);
  });

  it('reports the free share, which dominates for a cache-heavy user', () => {
    const f = [file([turn('2026-09-08T10:00:00.000Z', u({ output: 1000, cacheRead: 1_000_000 }))])];
    const v = buildQuota(f, MAX_20X, Date.parse('2026-09-08T12:00:00.000Z'));
    expect(v.freeShare).toBeGreaterThan(0.9);
    expect(v.metered).toBeLessThan(v.apiCost);
  });
});

describe('5-hour session windows', () => {
  it('snaps the window start down to a :00/:30 boundary', () => {
    // Observed behaviour: a rejection at 04:18Z reported a 04:30Z reset, i.e. a
    // window opened at 23:30Z by a turn at 23:29:57.
    const w = sessionWindows(recs([file([turn('2026-09-01T23:47:00.000Z', u({ output: 1000 }))])]), MAX_20X);
    expect(new Date(w[0]!.start).toISOString()).toBe('2026-09-01T23:30:00.000Z');
    expect(w[0]!.end - w[0]!.start).toBe(SESSION_WINDOW_MS);
  });

  it('keeps turns inside one window and opens a new one after it closes', () => {
    const f = [file([
      turn('2026-09-01T10:00:00.000Z', u({ output: 1000 })),
      turn('2026-09-01T14:30:00.000Z', u({ output: 1000 })), // still inside 10:00-15:00
      turn('2026-09-01T15:30:00.000Z', u({ output: 1000 })), // after it closed
    ])];
    const w = sessionWindows(recs(f), MAX_20X);
    expect(w).toHaveLength(2);
    expect(w[0]!.turns).toBe(2);
    expect(w[1]!.turns).toBe(1);
  });

  it('flags a window that reached the budget', () => {
    // $75 of metered spend on Opus output = 3M output tokens.
    const f = [file([turn('2026-09-01T10:00:00.000Z', u({ output: 3_000_000 }))])];
    const v = buildQuota(f, MAX_20X, Date.parse('2026-09-01T12:00:00.000Z'));
    expect(v.sessionsMaxed).toBe(1);
    expect(v.peakSession).toBeGreaterThanOrEqual(1);
  });
});

describe('weekly windows', () => {
  it('rolls over on the plan boundary, not the calendar week', () => {
    // MAX_20X resets Sunday 04:00Z. 03:00Z Sunday is still the *previous* week.
    const before = weekStart(Date.parse('2026-09-06T03:00:00.000Z'), MAX_20X);
    const after = weekStart(Date.parse('2026-09-06T05:00:00.000Z'), MAX_20X);
    expect(new Date(before).toISOString()).toBe('2026-08-30T04:00:00.000Z');
    expect(new Date(after).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(after - before).toBe(WEEK_MS);
  });

  it('splits spend either side of the reset', () => {
    const f = [file([
      turn('2026-09-06T03:00:00.000Z', u({ output: 100_000 })),
      turn('2026-09-06T05:00:00.000Z', u({ output: 100_000 })),
    ])];
    const w = weeklyWindows(recs(f), MAX_20X);
    expect(w).toHaveLength(2);
    expect(w[0]!.metered).toBeCloseTo(w[1]!.metered);
  });

  it('tracks the scoped family separately from the overall total', () => {
    const f = [file([
      turn('2026-09-08T10:00:00.000Z', u({ output: 100_000 }), 'claude-opus-5'),
      turn('2026-09-08T10:05:00.000Z', u({ output: 100_000 }), 'claude-fable-5-1'),
    ])];
    const w = weeklyWindows(recs(f), MAX_20X)[0]!;
    // Fable output is $50/MTok vs Opus $25, so the scoped slice is 2/3 of spend.
    expect(w.scoped).toBeCloseTo(5);
    expect(w.metered).toBeCloseTo(7.5);
    expect(w.scopedUtilization).toBeCloseTo(5 / MAX_20X.scoped!.weekly);
  });

  it('maps a model id to its family', () => {
    expect(modelFamily('claude-fable-5-1')).toBe('fable');
    expect(modelFamily('claude-opus-5')).toBe('opus');
  });
});

describe('week forecast', () => {
  const plan: QuotaPlan = { ...MAX_20X, weekly: 100, scoped: undefined as never };

  it('projects the current rate to the end of the week', () => {
    // Half the week gone, half the budget spent -> lands exactly at 100%.
    const start = Date.parse('2026-09-06T04:00:00.000Z');
    const now = start + WEEK_MS / 2;
    const f = [file([turn(new Date(start + 3600_000).toISOString(), u({ output: 2_000_000 }))])];
    const w = weeklyWindows(recs(f), plan);
    const fc = forecastWeek(w, plan, now)!;
    expect(fc.window.metered).toBeCloseTo(50);
    expect(fc.projected).toBeCloseTo(1, 1);
    expect(fc.bindingLimit).toBe('weekly');
    expect(fc.exhaustsAt).toBeDefined();
  });

  it('reports no binding limit when the pace is comfortable', () => {
    const start = Date.parse('2026-09-06T04:00:00.000Z');
    const f = [file([turn(new Date(start + 3600_000).toISOString(), u({ output: 200_000 }))])];
    const fc = forecastWeek(weeklyWindows(recs(f), plan), plan, start + WEEK_MS / 2)!;
    expect(fc.projected).toBeLessThan(1);
    expect(fc.bindingLimit).toBe('none');
    expect(fc.exhaustsAt).toBeUndefined();
  });

  it('names the scoped sub-limit when it binds first', () => {
    const start = Date.parse('2026-09-06T04:00:00.000Z');
    const f = [file([turn(new Date(start + 3600_000).toISOString(), u({ output: 3_000_000 }), 'claude-fable-5-1')])];
    const fc = forecastWeek(weeklyWindows(recs(f), MAX_20X), MAX_20X, start + WEEK_MS / 2)!;
    expect(fc.projectedScoped).toBeGreaterThan(fc.projected);
    expect(fc.bindingLimit).toBe('scoped');
  });
});

describe('quota log parsing', () => {
  const line = (t: string, five: number, seven: number, fable: number, reset = '2026-09-06T10:59:59Z') =>
    JSON.stringify({
      v: 1, t, src: 'macapp',
      raw: {
        five_hour: { utilization: five, resets_at: reset },
        seven_day: { utilization: seven, resets_at: '2026-09-13T03:59:59Z' },
        limits: [
          { kind: 'session', percent: five, resets_at: reset },
          { kind: 'weekly_all', percent: seven, resets_at: '2026-09-13T03:59:59Z' },
          {
            kind: 'weekly_scoped', percent: fable, resets_at: '2026-09-13T03:59:59Z',
            scope: { model: { id: null, display_name: 'Fable' } },
          },
        ],
      },
    });

  it('lifts the three limits and the scoped label', () => {
    const s = parseQuotaLog(line('2026-09-06T09:54:05.830Z', 9, 2, 5))[0]!;
    expect(s.session).toBe(9);
    expect(s.weekly).toBe(2);
    expect(s.scoped).toBe(5);
    expect(s.scopedLabel).toBe('Fable');
    expect(s.sessionResetsAt).toBe(Date.parse('2026-09-06T10:59:59Z'));
  });

  it('skips heartbeats and malformed lines without failing the import', () => {
    const text = [
      line('2026-09-06T09:54:05.830Z', 9, 2, 5),
      JSON.stringify({ v: 1, t: '2026-09-06T09:57:00Z', src: 'hb' }), // no payload
      '{not json',
      '',
    ].join('\n');
    expect(parseQuotaLog(text)).toHaveLength(1);
  });

  it('drops readings that fall below the running peak', () => {
    // A failed poll reports 0. Taking it at face value would halve the window's
    // peak and so double the limit inferred from it.
    const text = [
      line('2026-09-06T06:00:00Z', 10, 5, 5),
      line('2026-09-06T07:00:00Z', 40, 8, 9),
      line('2026-09-06T08:00:00Z', 0, 0, 0), // dropout
      line('2026-09-06T09:00:00Z', 55, 9, 11),
    ].join('\n');
    const kept = [...windowsOf(parseQuotaLog(text), 'session').values()][0]!;
    expect(kept.map((s) => s.session)).toEqual([10, 40, 55]);
  });
});

describe('calibration from a measured log', () => {
  /** A window observed from zero, ramping to `peak`, sampled every 10 minutes. */
  function windowSamples(startIso: string, peak: number, hours = 5): string[] {
    const start = Date.parse(startIso);
    const reset = new Date(start + hours * 3600_000).toISOString();
    const n = 30;
    return Array.from({ length: n }, (_, i) => {
      const util = Math.round((peak * i) / (n - 1));
      return JSON.stringify({
        v: 1, t: new Date(start + i * 10 * 60_000).toISOString(), src: 'macapp',
        raw: {
          five_hour: { utilization: util, resets_at: reset },
          seven_day: { utilization: 0, resets_at: reset },
          limits: [],
        },
      });
    });
  }

  /** Spend spread across the window, the way real turns arrive. */
  function rampSpend(startIso: string, total: number, n = 30, stepMin = 10, scoped = 0) {
    const start = Date.parse(startIso);
    return Array.from({ length: n }, (_, i) => ({
      // Aligned with the readings, so every interval has spend to explain it.
      ts: start + i * stepMin * 60_000,
      metered: total / n,
      scoped: scoped / n,
    }));
  }

  it('recovers the budget from peak utilisation and measured spend', () => {
    // $30 of metered spend at a 60% peak implies a $50 budget.
    const start = '2026-09-08T00:00:00.000Z';
    const samples = parseQuotaLog(windowSamples(start, 60).join('\n'));
    const cal = calibrate({ spend: rampSpend(start, 30), samples, weekMs: WEEK_MS });
    expect(cal.points.session).toHaveLength(1);
    expect(cal.session).toBeCloseTo(50, 0);
  });

  it('refuses a window the loaded transcripts cannot account for', () => {
    // Utilisation climbs to 60% while we can see almost none of the spend -
    // exactly what a partial file drop looks like. Dividing here would imply a
    // budget several times too small.
    const start = '2026-09-08T00:00:00.000Z';
    const samples = parseQuotaLog(windowSamples(start, 60).join('\n'));
    const cal = calibrate({
      spend: [{ ts: Date.parse('2026-09-08T01:00:00.000Z'), metered: 3, scoped: 0 }],
      samples,
      weekMs: WEEK_MS,
    });
    expect(cal.points.session).toHaveLength(0);
    expect(cal.session).toBeUndefined();
    expect(cal.unexplainedWindows).toBeGreaterThan(0);
  });

  it('refuses a window the log did not observe from the start', () => {
    // Spend before the log was running is missing from the numerator, so the
    // implied budget would come out far too low.
    const start = Date.parse('2026-09-08T00:00:00.000Z');
    const reset = new Date(start + SESSION_WINDOW_MS).toISOString();
    const late = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({
        v: 1, t: new Date(start + 3 * 3600_000 + i * 60_000).toISOString(), src: 'macapp',
        raw: { five_hour: { utilization: 50 + i, resets_at: reset }, seven_day: {}, limits: [] },
      }),
    ).join('\n');
    const cal = calibrate({
      spend: rampSpend(new Date(start + 3 * 3600_000).toISOString(), 30, 30, 1),
      samples: parseQuotaLog(late),
      weekMs: WEEK_MS,
    });
    expect(cal.points.session).toHaveLength(0);
    expect(cal.session).toBeUndefined();
  });

  it('refuses a window with a long blind spot before the peak', () => {
    const start = Date.parse('2026-09-08T00:00:00.000Z');
    const reset = new Date(start + SESSION_WINDOW_MS).toISOString();
    const at = (mins: number, util: number) =>
      JSON.stringify({
        v: 1, t: new Date(start + mins * 60_000).toISOString(), src: 'macapp',
        raw: { five_hour: { utilization: util, resets_at: reset }, seven_day: {}, limits: [] },
      });
    // Eight readings, then a two-hour hole, then the peak: usage may have
    // happened unobserved, so this window cannot calibrate anything.
    const lines = [...Array.from({ length: 8 }, (_, i) => at(i, i)), at(180, 70)].join('\n');
    const cal = calibrate({
      spend: rampSpend(new Date(start).toISOString(), 30, 9, 20),
      samples: parseQuotaLog(lines),
      weekMs: WEEK_MS,
    });
    expect(cal.points.session).toHaveLength(0);
  });

  it('ignores a peak too low to extrapolate from', () => {
    const cal = calibrate({
      spend: rampSpend('2026-09-08T00:00:00.000Z', 5),
      samples: parseQuotaLog(windowSamples('2026-09-08T00:00:00.000Z', 12).join('\n')),
      weekMs: WEEK_MS,
    });
    expect(cal.points.session).toHaveLength(0);
  });

  it('overlays measured budgets on the plan and keeps what it could not measure', () => {
    const cal = calibrate({
      spend: rampSpend('2026-09-08T00:00:00.000Z', 30),
      samples: parseQuotaLog(windowSamples('2026-09-08T00:00:00.000Z', 60).join('\n')),
      weekMs: WEEK_MS,
    });
    const plan = calibratedPlan(MAX_20X, cal);
    expect(plan.session).toBeCloseTo(50, 0);
    expect(plan.weekly).toBe(MAX_20X.weekly); // no weekly window qualified
    expect(plan.provenance).toMatch(/your own quota log/);
  });
});

describe('meteredSpend feeds the calibrator', () => {
  it('splits out the scoped family per turn', () => {
    const f = [file([
      turn('2026-09-08T10:00:00.000Z', u({ output: 1e6 }), 'claude-opus-5'),
      turn('2026-09-08T10:01:00.000Z', u({ output: 1e6 }), 'claude-fable-5'),
    ])];
    const spend = meteredSpend(f, MAX_20X);
    expect(spend).toHaveLength(2);
    expect(spend[0]!.scoped).toBe(0);
    expect(spend[1]!.scoped).toBeCloseTo(50);
  });

  it('counts a turn copied across resumed files exactly once', () => {
    const shared = turn('2026-09-08T10:00:00.000Z', u({ output: 1e6 }));
    const spend = meteredSpend([file([shared]), file([{ ...shared }])], MAX_20X);
    expect(spend).toHaveLength(1);
  });
});
