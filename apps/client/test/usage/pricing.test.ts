// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { TokenUsage } from '@/schema';
import { costOf, canonicalModel, DEFAULT_PRICING, type ModelRate } from '@/usage/pricing';

function u(p: Partial<TokenUsage>): TokenUsage {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, ...p };
}

describe('PRD-13 FR-4/5/6: cost estimation', () => {
  it('prices each token kind distinctly for a known model', () => {
    // Opus: input $5, output $25, cacheRead $0.50, 5m write $6.25 per MTok.
    const c = costOf(u({ input: 1e6, output: 1e6, cacheRead: 1e6, cacheCreate: 1e6 }), 'claude-opus-4-8');
    expect(c.unpriced).toBe(false);
    expect(c.input).toBeCloseTo(5);
    expect(c.output).toBeCloseTo(25);
    expect(c.cacheRead).toBeCloseTo(0.5);
    expect(c.cacheWrite).toBeCloseTo(6.25); // no split -> 5m rate
    expect(c.total).toBeCloseTo(36.75);
  });

  it('cache reads are an order of magnitude cheaper than fresh input', () => {
    const read = costOf(u({ cacheRead: 1e6 }), 'claude-opus-4-8').total;
    const input = costOf(u({ input: 1e6 }), 'claude-opus-4-8').total;
    expect(read).toBeCloseTo(input / 10);
  });

  it('uses the 1h/5m split when present', () => {
    // 1h write $10/MTok, 5m write $6.25/MTok for Opus.
    const c = costOf(u({ cacheCreate: 2e6, cacheCreate1h: 1e6, cacheCreate5m: 1e6 }), 'claude-opus-4-8');
    expect(c.cacheWrite).toBeCloseTo(16.25);
  });

  it('flags unknown models as unpriced (never mis-priced)', () => {
    const c = costOf(u({ input: 1e6, output: 1e6 }), 'some-future-model');
    expect(c.unpriced).toBe(true);
    expect(c.total).toBe(0);
  });

  it('resolves a date-suffixed model id to its canonical rate', () => {
    expect(canonicalModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
    const c = costOf(u({ output: 1e6 }), 'claude-haiku-4-5-20251001');
    expect(c.unpriced).toBe(false);
    expect(c.output).toBeCloseTo(5); // Haiku output $5/MTok
  });

  it('honors a user-supplied override table', () => {
    const override: Record<string, ModelRate> = {
      ...DEFAULT_PRICING,
      'claude-opus-4-8': { ...DEFAULT_PRICING['claude-opus-4-8']!, input: 99 },
    };
    expect(costOf(u({ input: 1e6 }), 'claude-opus-4-8', override).input).toBeCloseTo(99);
  });

  it('every bundled rate carries an asOf date and derived cache tiers', () => {
    for (const r of Object.values(DEFAULT_PRICING)) {
      expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.cacheRead).toBeCloseTo(r.input * 0.1);
      expect(r.cacheWrite1h).toBeCloseTo(r.input * 2);
    }
  });
});
