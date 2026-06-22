import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTheme, setTheme, resolveTheme, applyResolvedTheme } from '../src/lib/theme';

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: dark && q.includes('dark'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

describe('theme module (PRD-01 §7.6, FR-4)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    stubMatchMedia(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to "system" when unset', () => {
    expect(getTheme()).toBe('system');
  });

  it('resolves an unknown stored value to the default ("system" → light)', () => {
    localStorage.setItem('claudepad.theme', 'banana');
    expect(getTheme()).toBe('system');
    expect(resolveTheme()).toBe('light');
  });

  it('resolves system via matchMedia', () => {
    stubMatchMedia(true);
    expect(resolveTheme('system')).toBe('dark');
    stubMatchMedia(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('setTheme persists and applies data-theme', () => {
    expect(setTheme('dark')).toBe('dark');
    expect(localStorage.getItem('claudepad.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getTheme()).toBe('dark');
  });

  it('applyResolvedTheme writes the resolved value to <html>', () => {
    setTheme('system');
    stubMatchMedia(true);
    expect(applyResolvedTheme('system')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('explicit light/dark pass through resolution unchanged', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
});
