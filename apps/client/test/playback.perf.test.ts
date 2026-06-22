// Perf smoke for the playback engine at scale (PRD-08 Q-5 / FR-20). The engine
// is meant to be O(n) to build and O(log n) to seek, and changing only the
// playhead must never rebuild the timeline. We assert correctness at >= 5k
// events plus generous wall-clock backstops (huge headroom - these guard against
// an accidental O(n^2) regression, not micro-perf).

import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent } from '@/schema';
import {
  buildTimeline,
  resolveFrame,
  segIndexAt,
  stepTargetMs,
} from '../src/playback/buildTimeline';

const EVENT_COUNT = 5200;

// A realistic-ish long session: prose turns, a few timestamped idle gaps, and
// runs of same-name tool calls (so folding + idle collapse both exercise).
function bigSession(n: number): Session {
  const events: SessionEvent[] = [];
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  for (let i = 0; i < n; i++) {
    clock += 1000 * ((i % 7) + 1);
    // Every ~50 events, jump the clock to force an idle-gap collapse.
    if (i % 50 === 0) clock += 15 * 60 * 1000;
    const ts = new Date(clock).toISOString();
    const m = i % 10;
    if (m < 3) {
      events.push({ kind: 'user', content: [{ type: 'text', text: `prompt ${i} ${'x'.repeat(40)}` }], ts });
    } else if (m < 6) {
      events.push({ kind: 'assistant', content: [{ type: 'text', text: `reply ${i} ${'y'.repeat(120)}` }], ts });
    } else {
      // A run of same-name tool calls -> folds in present mode.
      events.push({ kind: 'tool_use', name: 'Read', input: { path: `f${i}.ts` }, toolId: `t${i}`, ts });
    }
  }
  return { id: 'big', source: 'claude-code', formatVersion: 'perf', meta: {}, events };
}

describe('playback engine perf smoke (>= 5k events, FR-20)', () => {
  const session = bigSession(EVENT_COUNT);

  it('builds a correct timeline in one pass, in O(n)', () => {
    const t0 = performance.now();
    const tl = buildTimeline(session, 'present');
    const buildMs = performance.now() - t0;

    expect(tl.rowCount).toBe(EVENT_COUNT);
    expect(tl.rowToSeg).toHaveLength(EVENT_COUNT);
    // Every render row maps to a real segment.
    expect(tl.rowToSeg.every((s) => s >= 0)).toBe(true);
    // Segments are contiguous and totalMs is exact.
    for (let i = 1; i < tl.segs.length; i++) {
      expect(tl.segs[i]!.startMs).toBe(tl.segs[i - 1]!.startMs + tl.segs[i - 1]!.dwellMs);
    }
    const last = tl.segs[tl.segs.length - 1]!;
    expect(tl.totalMs).toBe(last.startMs + last.dwellMs);
    // Folding + idle collapse actually triggered at this scale.
    expect(tl.segs.some((s) => s.folded)).toBe(true);
    expect(tl.segs.some((s) => s.idleMarker)).toBe(true);
    // Backstop: 5k events should build far under this; flags an O(n^2) regression.
    expect(buildMs).toBeLessThan(2000);
  });

  it('seeks in O(log n) without rebuilding the timeline (FR-20)', () => {
    const tl = buildTimeline(session, 'present');
    const segsRef = tl.segs; // identity must not change across seeks
    const SEEKS = 20_000;

    const t0 = performance.now();
    let prevSeg = -1;
    let monotonic = true;
    for (let k = 0; k < SEEKS; k++) {
      // Sweep the full range deterministically.
      const ph = (tl.totalMs * k) / SEEKS;
      const f = resolveFrame(tl, ph);
      if (f.segIndex < prevSeg) monotonic = false;
      prevSeg = f.segIndex;
    }
    const seekMs = performance.now() - t0;

    // Increasing playhead -> non-decreasing active segment.
    expect(monotonic).toBe(true);
    // The timeline object is untouched by seeking (no rebuild / mutation).
    expect(tl.segs).toBe(segsRef);
    expect(tl.rowCount).toBe(EVENT_COUNT);
    // Backstop: 20k binary-search seeks are trivial; O(n) per-seek would blow this.
    expect(seekMs).toBeLessThan(1000);
  });

  it('resolveFrame is consistent with segIndexAt and clamps at the ends', () => {
    const tl = buildTimeline(session, 'present');
    expect(resolveFrame(tl, 0).activeRowIndex).toBe(0);
    const end = resolveFrame(tl, tl.totalMs + 1e6);
    expect(end.revealedCount).toBe(EVENT_COUNT);
    expect(end.fraction).toBeCloseTo(1, 5);

    // step forward across the whole timeline terminates and lands on real rows.
    let ph = 0;
    let steps = 0;
    for (; steps <= EVENT_COUNT + 10; steps++) {
      const next = stepTargetMs(tl, ph, 1);
      if (next === ph) break;
      ph = next;
      expect(tl.segs[segIndexAt(tl, ph)]!.idleMarker).toBeUndefined();
    }
    expect(ph).toBe(tl.totalMs);
  });
});
