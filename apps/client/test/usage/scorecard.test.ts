// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Session, SessionEvent, TokenUsage } from '@/schema';
import { aggregateFile } from '@/usage/aggregate';
import { buildDashboard, DEFAULT_SETTINGS } from '@/usage/derive';
import { buildScorecard } from '@/usage/scorecard';
import { drawScorecard, CARD_W, type CardPalette } from '@/usage/scorecard';

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

// Two cache-heavy turns in one session, one fresh turn in another project.
const FILES = [
  fileOf('a1', '/work/alpha', [
    assistant('2026-06-10T09:00:00.000Z', 'claude-opus-4-8', u({ input: 1000, output: 500, cacheRead: 8000, cacheCreate: 500 })),
    assistant('2026-06-10T09:01:00.000Z', 'claude-opus-4-8', u({ input: 200, output: 300, cacheRead: 9000 }))
  ]),
  fileOf('b1', '/work/beta', [assistant('2026-05-20T11:00:00.000Z', 'claude-haiku-4-5', u({ input: 300, output: 100 }))])
];

describe('buildScorecard', () => {
  it('derives vanity + efficiency metrics from the dashboard view', () => {
    const view = buildDashboard(FILES, DEFAULT_SETTINGS);
    const card = buildScorecard(view);

    const total = 1000 + 500 + 8000 + 500 + 200 + 300 + 9000 + 300 + 100;
    expect(card.totalTokens).toBe(total);
    expect(card.sessions).toBe(2);
    expect(card.projects).toBe(2);

    // cacheRatio = cacheRead / total
    expect(card.cacheRatio).toBeCloseTo(17000 / total);
    // avgContext = (input + cacheCreate + cacheRead) / turns(3)
    expect(card.avgContextPerTurn).toBeCloseTo((1000 + 500 + 8000 + 200 + 9000 + 300) / 3);
    // avgSession = total / 2 sessions
    expect(card.avgSessionTokens).toBeCloseTo(total / 2);
    // both sessions are under 1M tokens -> fully lean
    expect(card.leanShare).toBe(1);
  });

  it('grades cache efficiency on an A..E scale', () => {
    const heavy = buildScorecard(buildDashboard(
      [fileOf('c', '/w', [assistant('2026-06-10T09:00:00.000Z', 'claude-opus-4-8', u({ cacheRead: 9500, output: 500 }))])],
      DEFAULT_SETTINGS
    ));
    expect(heavy.grade).toBe('A'); // 95% cache read

    const fresh = buildScorecard(buildDashboard(
      [fileOf('d', '/w', [assistant('2026-06-10T09:00:00.000Z', 'claude-opus-4-8', u({ input: 9000, output: 1000 }))])],
      DEFAULT_SETTINGS
    ));
    expect(fresh.grade).toBe('E'); // 0% cache read
  });

  it('handles an empty view without dividing by zero', () => {
    const card = buildScorecard(buildDashboard([], DEFAULT_SETTINGS));
    expect(card.totalTokens).toBe(0);
    expect(card.cacheRatio).toBe(0);
    expect(card.avgContextPerTurn).toBe(0);
    expect(card.avgSessionTokens).toBe(0);
    expect(card.leanShare).toBe(0);
    expect(card.grade).toBe('E');
  });
});

// A recording mock of the bits of CanvasRenderingContext2D the renderer uses -
// enough to prove drawScorecard runs end-to-end and emits the headline figures.
function mockContext() {
  const texts: string[] = [];
  let fills = 0;
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillRect: () => { fills++; },
    fillText: (t: string) => { texts.push(t); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {}
  };
  return { ctx, texts, fillCount: () => fills };
}

const PALETTE: CardPalette = {
  bg: 'rgb(1,1,1)', surface: 'rgb(2,2,2)', text: 'rgb(3,3,3)', muted: 'rgb(4,4,4)',
  accent: 'rgb(5,5,5)', accentTint: 'rgba(5,5,5,0.1)', border: 'rgb(6,6,6)',
  serif: 'serif', sans: 'sans-serif', mono: 'monospace'
};

describe('drawScorecard', () => {
  it('renders the wordmark and headline figures onto the context', () => {
    const view = buildDashboard(FILES, DEFAULT_SETTINGS);
    const card = buildScorecard(view);
    const { ctx, texts, fillCount } = mockContext();

    drawScorecard(ctx, card, PALETTE, { rangeLabel: 'all time' });

    expect(CARD_W).toBe(1200);
    expect(fillCount()).toBeGreaterThan(0);
    expect(texts).toContain('claudepad');
    expect(texts).toContain('all time');
    expect(texts).toContain(card.grade);
    // total tokens headline is present in compact form
    expect(texts.some((t) => /[\d.]+[KMB]?$/.test(t))).toBe(true);
  });

  it('stamps an identity line when provided', () => {
    const card = buildScorecard(buildDashboard(FILES, DEFAULT_SETTINGS));
    const { ctx, texts } = mockContext();
    drawScorecard(ctx, card, PALETTE, { identity: { name: 'Ada', emoji: '🔑🌊🎭🦊🌟🎲' } });
    expect(texts.some((t) => t.includes('Ada'))).toBe(true);
  });
});
