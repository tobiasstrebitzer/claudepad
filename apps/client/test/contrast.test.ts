import { describe, it, expect } from 'vitest';
import { contrastRatio, parseColor, composite } from '../src/lib/contrast';

describe('contrast', () => {
  it('computes the canonical extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });

  it('is symmetric (order-independent)', () => {
    expect(contrastRatio('#cc785c', '#fafaf7')).toBeCloseTo(
      contrastRatio('#fafaf7', '#cc785c'),
      5,
    );
  });

  it('composites alpha over the background before measuring', () => {
    // Fully transparent fg → ratio collapses toward 1 (fg becomes bg).
    expect(contrastRatio('rgba(0,0,0,0)', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('parses #rgb, #rrggbb, #rrggbbaa and rgba()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#1f1e1d')).toEqual({ r: 31, g: 30, b: 29, a: 1 });
    const aa = parseColor('#cc785c80');
    expect(aa?.r).toBe(204);
    expect(aa?.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgba(204, 120, 92, 0.1)')).toEqual({
      r: 204,
      g: 120,
      b: 92,
      a: 0.1,
    });
    expect(parseColor('not-a-color')).toBeNull();
  });

  it('composite blends correctly', () => {
    expect(
      composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }),
    ).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    });
  });

  it('the approved token pairings clear their AA targets', () => {
    // mirrors scripts/check-contrast.mjs (light theme)
    expect(contrastRatio('#1f1e1d', '#fafaf7')).toBeGreaterThanOrEqual(4.5); // text on bg
    expect(contrastRatio('#6b6862', '#fafaf7')).toBeGreaterThanOrEqual(4.5); // muted on bg
    expect(contrastRatio('#ffffff', '#cc785c')).toBeGreaterThanOrEqual(3); // label on accent (AA-large)
    expect(contrastRatio('#b87f30', '#fafaf7')).toBeGreaterThanOrEqual(3); // warn on bg
  });
});
