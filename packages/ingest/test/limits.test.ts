import { describe, it, expect } from 'vitest';
import { checkSize, DEFAULT_CAPS, formatBytes } from '../src/limits';

describe('size caps (PRD-04 FR-16)', () => {
  it('passes under the soft cap', () => {
    expect(checkSize(1024)).toEqual({
      bytes: 1024,
      overSoftCap: false,
      overHardCap: false,
    });
  });

  it('flags over-soft but under-hard', () => {
    const v = checkSize(DEFAULT_CAPS.soft + 1);
    expect(v.overSoftCap).toBe(true);
    expect(v.overHardCap).toBe(false);
  });

  it('flags over-hard', () => {
    const v = checkSize(DEFAULT_CAPS.hard + 1);
    expect(v.overSoftCap).toBe(true);
    expect(v.overHardCap).toBe(true);
  });

  it('is exclusive at the exact boundary', () => {
    expect(checkSize(DEFAULT_CAPS.soft).overSoftCap).toBe(false);
    expect(checkSize(DEFAULT_CAPS.hard).overHardCap).toBe(false);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});
