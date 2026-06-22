import { describe, it, expect } from 'vitest';
import { parsePlaybackParams } from '../src/playback/deepLink';
import { formatClock, formatIdle } from '../src/playback/format';

describe('parsePlaybackParams (§7/§8)', () => {
  it('parses a full present deep link', () => {
    expect(parsePlaybackParams('?play=1&mode=present&speed=1.5&appear=type')).toEqual({
      play: true,
      mode: 'present',
      speed: 1.5,
      appear: 'type',
      readingSpeed: undefined,
    });
  });

  it('accepts play=true and a reading-speed override', () => {
    const p = parsePlaybackParams('play=true&rs=40');
    expect(p.play).toBe(true);
    expect(p.readingSpeed).toBe(40);
  });

  it('falls back defensively on invalid values (never throws)', () => {
    const p = parsePlaybackParams('?play=nope&mode=warp&speed=99&appear=blink&rs=1000');
    expect(p).toEqual({
      play: false,
      mode: undefined,
      speed: undefined,
      appear: undefined,
      readingSpeed: undefined,
    });
  });

  it('treats an empty query as no playback', () => {
    expect(parsePlaybackParams('')).toEqual({ play: false });
  });
});

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(42_000)).toBe('0:42');
    expect(formatClock(7 * 60_000 + 18_000)).toBe('7:18');
    expect(formatClock(3_661_000)).toBe('1:01:01');
  });
});

describe('formatIdle', () => {
  it('renders the original → collapsed beat label', () => {
    expect(formatIdle(252, 0.8)).toBe('idle 4m 12s → 0.8s');
    expect(formatIdle(45, 0.8)).toBe('idle 45s → 0.8s');
  });
});
