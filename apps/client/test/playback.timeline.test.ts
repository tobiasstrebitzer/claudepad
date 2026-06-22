import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent } from '@claudepad/schema';
import {
  buildTimeline,
  resolveFrame,
  segIndexAt,
  rowStartMs,
  stepTargetMs,
} from '../src/playback/buildTimeline';
import {
  DEFAULT_PACING,
  dwellPresentMs,
  weightedCharCount,
  spamDwellMs,
} from '../src/playback/pacing';

const session = (events: SessionEvent[]): Session => ({
  id: 's',
  source: 'claude-code',
  formatVersion: 'unknown',
  meta: {},
  events,
});

const text = (s: string): { type: 'text'; text: string } => ({ type: 'text', text: s });

const user = (s: string, ts?: string): SessionEvent => ({
  kind: 'user',
  content: [text(s)],
  ...(ts ? { ts } : {}),
});
const assistant = (s: string, ts?: string): SessionEvent => ({
  kind: 'assistant',
  content: [text(s)],
  ...(ts ? { ts } : {}),
});
const tool = (name: string, ts?: string, id?: string): SessionEvent => ({
  kind: 'tool_use',
  name,
  input: { path: 'x' },
  ...(id ? { toolId: id } : {}),
  ...(ts ? { ts } : {}),
});

describe('buildTimeline - invariants (FR-1)', () => {
  it('segments are contiguous: start[i+1] === start[i] + dwell[i]', () => {
    const tl = buildTimeline(session([user('hello'), assistant('a longer reply here')]));
    for (let i = 1; i < tl.segs.length; i++) {
      expect(tl.segs[i]!.startMs).toBe(tl.segs[i - 1]!.startMs + tl.segs[i - 1]!.dwellMs);
    }
    expect(tl.segs[0]!.startMs).toBe(0);
    const last = tl.segs[tl.segs.length - 1]!;
    expect(tl.totalMs).toBe(last.startMs + last.dwellMs);
  });

  it('rowToSeg covers every render row', () => {
    const tl = buildTimeline(session([user('a'), assistant('b'), user('c')]));
    expect(tl.rowCount).toBe(3);
    expect(tl.rowToSeg).toHaveLength(3);
    expect(tl.rowToSeg.every((s) => s >= 0)).toBe(true);
  });
});

describe('present-mode pacing (FR-9/10)', () => {
  it('dwell follows BASE + weightedChars/readingSpeed, clamped', () => {
    const row = { kind: 'event' as const, index: 0, event: user('hello world') };
    const expected = dwellPresentMs(row, DEFAULT_PACING);
    const tl = buildTimeline(session([user('hello world')]), 'present');
    expect(tl.segs[0]!.dwellMs).toBe(expected);
  });

  it('a tiny event still gets at least MIN_DWELL', () => {
    const tl = buildTimeline(session([user('.')]), 'present');
    expect(tl.segs[0]!.dwellMs).toBeGreaterThanOrEqual(DEFAULT_PACING.minDwell * 1000);
  });

  it('a huge event is capped at MAX_DWELL', () => {
    const tl = buildTimeline(session([assistant('x'.repeat(100_000))]), 'present');
    expect(tl.segs[0]!.dwellMs).toBe(DEFAULT_PACING.maxDwell * 1000);
  });

  it('code reads faster than the same length of prose (weights)', () => {
    const proseRow = { kind: 'event' as const, index: 0, event: assistant('a'.repeat(500)) };
    const codeRow = {
      kind: 'event' as const,
      index: 0,
      event: {
        kind: 'assistant' as const,
        content: [{ type: 'code' as const, text: 'a'.repeat(500) }],
      },
    };
    expect(weightedCharCount(codeRow, DEFAULT_PACING)).toBeLessThan(
      weightedCharCount(proseRow, DEFAULT_PACING),
    );
  });
});

describe('real-time mode (FR-2)', () => {
  it('derives dwell from timestamp deltas, clamped to MAX_REALTIME_GAP', () => {
    const tl = buildTimeline(
      session([
        user('a', '2026-01-01T00:00:00.000Z'),
        assistant('b', '2026-01-01T00:00:03.000Z'), // 3s gap
        user('c', '2026-01-01T00:05:00.000Z'), // 5min gap → clamped to 10s
      ]),
      'realtime',
    );
    expect(tl.segs[1]!.dwellMs).toBe(3000);
    expect(tl.segs[2]!.dwellMs).toBe(DEFAULT_PACING.maxRealtimeGap * 1000);
  });

  it('falls back to content dwell when timestamps are missing/equal/out-of-order', () => {
    const eq = '2026-01-01T00:00:00.000Z';
    const tl = buildTimeline(
      session([
        user('a', eq),
        assistant('coarse identical ts', eq), // equal ts → fallback
        user('no ts at all'), // missing ts → fallback
      ]),
      'realtime',
    );
    const r1 = { kind: 'event' as const, index: 1, event: assistant('coarse identical ts') };
    const r2 = { kind: 'event' as const, index: 2, event: user('no ts at all') };
    expect(tl.segs[1]!.dwellMs).toBe(dwellPresentMs(r1, DEFAULT_PACING));
    expect(tl.segs[2]!.dwellMs).toBe(dwellPresentMs(r2, DEFAULT_PACING));
  });
});

describe('idle collapse (FR-11)', () => {
  it('inserts a marked beat for a gap over IDLE_THRESHOLD (present mode)', () => {
    const tl = buildTimeline(
      session([
        user('a', '2026-01-01T00:00:00.000Z'),
        assistant('b', '2026-01-01T00:10:00.000Z'), // 10min idle
      ]),
      'present',
    );
    const idle = tl.segs.find((s) => s.idleMarker);
    expect(idle).toBeDefined();
    expect(idle!.kind).toBe('idle');
    expect(idle!.dwellMs).toBe(DEFAULT_PACING.idleCollapsed * 1000);
    expect(idle!.idleSeconds).toBe(600);
    // The idle marker covers no rows.
    expect(idle!.rowStart).toBe(idle!.rowEnd);
  });

  it('does not collapse idle gaps in real-time mode', () => {
    const tl = buildTimeline(
      session([
        user('a', '2026-01-01T00:00:00.000Z'),
        assistant('b', '2026-01-01T00:10:00.000Z'),
      ]),
      'realtime',
    );
    expect(tl.segs.some((s) => s.idleMarker)).toBe(false);
  });
});

describe('tool-spam fold (FR-12)', () => {
  it('folds a run of ≥ TOOL_SPAM_RUN same-name tool rows into one sublinear beat', () => {
    const tl = buildTimeline(
      session([
        user('go'),
        tool('Read', undefined, 't1'),
        tool('Read', undefined, 't2'),
        tool('Read', undefined, 't3'),
        tool('Read', undefined, 't4'),
        assistant('done'),
      ]),
      'present',
    );
    const folded = tl.segs.find((s) => s.folded);
    expect(folded).toBeDefined();
    expect(folded!.foldCount).toBe(4);
    expect(folded!.foldName).toBe('Read');
    expect(folded!.dwellMs).toBe(spamDwellMs(4, DEFAULT_PACING));
    // All four tool rows map to the single folded segment.
    const segIdx = tl.segs.indexOf(folded!);
    expect(tl.rowToSeg.filter((s) => s === segIdx)).toHaveLength(4);
  });

  it('does not fold a short run (< TOOL_SPAM_RUN)', () => {
    const tl = buildTimeline(
      session([tool('Read', undefined, 't1'), tool('Read', undefined, 't2')]),
      'present',
    );
    expect(tl.segs.some((s) => s.folded)).toBe(false);
  });

  it('does not fold different tool names', () => {
    const tl = buildTimeline(
      session([
        tool('Read', undefined, 't1'),
        tool('Grep', undefined, 't2'),
        tool('Read', undefined, 't3'),
      ]),
      'present',
    );
    expect(tl.segs.some((s) => s.folded)).toBe(false);
  });
});

describe('fast-track de-emphasised kinds (present mode)', () => {
  const thinking = (s: string): SessionEvent => ({ kind: 'thinking', content: [text(s)] });

  it('caps thinking dwell to fastTrackMaxDwell, even for long content', () => {
    const tl = buildTimeline(session([thinking('x'.repeat(5000))]), 'present');
    expect(tl.segs[0]!.kind).toBe('thinking');
    expect(tl.segs[0]!.dwellMs).toBeLessThanOrEqual(DEFAULT_PACING.fastTrackMaxDwell * 1000);
  });

  it('does not fast-track an equally long assistant turn', () => {
    const tl = buildTimeline(session([assistant('x'.repeat(5000))]), 'present');
    expect(tl.segs[0]!.dwellMs).toBeGreaterThan(DEFAULT_PACING.fastTrackMaxDwell * 1000);
  });

  it('leaves thinking dwell untouched in real-time mode', () => {
    const tl = buildTimeline(
      session([
        thinking('a'),
        assistant('b', '2026-01-01T00:00:30.000Z'),
      ]),
      'realtime',
    );
    // No fast-track clamp applies in realtime; thinking falls back to content dwell.
    expect(tl.segs[0]!.kind).toBe('thinking');
  });
});

describe('resolveFrame (FR-4)', () => {
  const tl = buildTimeline(session([user('a'), assistant('b'), user('c')]), 'present');

  it('reveals the first row at t=0 and marks it active', () => {
    const f = resolveFrame(tl, 0);
    expect(f.revealedCount).toBe(1);
    expect(f.activeRowIndex).toBe(0);
  });

  it('reveals through the active segment as the playhead advances', () => {
    const midSecond = tl.segs[1]!.startMs + 1;
    const f = resolveFrame(tl, midSecond);
    expect(f.revealedCount).toBe(2);
    expect(f.activeRowIndex).toBe(1);
  });

  it('clamps at the end (all revealed, last active)', () => {
    const f = resolveFrame(tl, tl.totalMs + 9999);
    expect(f.revealedCount).toBe(3);
    expect(f.activeRowIndex).toBe(2);
    expect(f.fraction).toBeCloseTo(1, 5);
  });

  it('handles an empty session', () => {
    const f = resolveFrame(buildTimeline(session([])), 0);
    expect(f).toEqual({
      revealedCount: 0,
      activeRowIndex: -1,
      segIndex: -1,
      fraction: 0,
      activeSegStartMs: 0,
      activeSegDwellMs: 0,
    });
  });
});

describe('seek / step helpers (FR-8)', () => {
  it('rowStartMs returns the owning segment start', () => {
    const tl = buildTimeline(session([user('a'), assistant('b'), user('c')]), 'present');
    expect(rowStartMs(tl, 0)).toBe(tl.segs[0]!.startMs);
    expect(rowStartMs(tl, 2)).toBe(tl.segs[2]!.startMs);
  });

  it('stepTargetMs moves to adjacent event segments and skips idle markers', () => {
    const tl = buildTimeline(
      session([
        user('a', '2026-01-01T00:00:00.000Z'),
        assistant('b', '2026-01-01T00:10:00.000Z'), // idle marker inserted before
      ]),
      'present',
    );
    expect(tl.segs.some((s) => s.idleMarker)).toBe(true);
    // From row 0, stepping forward lands on the assistant row, not the idle beat.
    const target = stepTargetMs(tl, 0, 1);
    const landed = segIndexAt(tl, target);
    expect(tl.segs[landed]!.idleMarker).toBeUndefined();
    expect(tl.segs[landed]!.rowStart).toBe(1);
  });

  it('stepping past the end clamps to totalMs; past the start clamps to 0', () => {
    const tl = buildTimeline(session([user('a'), assistant('b')]), 'present');
    expect(stepTargetMs(tl, tl.totalMs, 1)).toBe(tl.totalMs);
    expect(stepTargetMs(tl, 0, -1)).toBe(0);
  });
});
