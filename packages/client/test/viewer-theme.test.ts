import { describe, it, expect, beforeEach } from 'vitest';
import {
  getViewerTheme,
  setViewerTheme,
  applyViewerTheme,
  VIEWER_THEMES,
} from '../src/lib/viewer-theme';

const attr = () => document.documentElement.getAttribute('data-viewer-theme');

describe('viewer-theme (aesthetic palette axis)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-viewer-theme');
  });

  it('defaults to warm when unset', () => {
    expect(getViewerTheme()).toBe('warm');
  });

  it('falls back to warm for an unknown stored value', () => {
    localStorage.setItem('claudepad.viewer-theme', 'neon');
    expect(getViewerTheme()).toBe('warm');
  });

  it('persists and reflects every valid palette', () => {
    for (const t of VIEWER_THEMES) {
      setViewerTheme(t);
      expect(localStorage.getItem('claudepad.viewer-theme')).toBe(t);
      expect(getViewerTheme()).toBe(t);
    }
  });

  it('setViewerTheme writes the data-viewer-theme attribute', () => {
    setViewerTheme('ocean');
    expect(attr()).toBe('ocean');
  });

  it('applyViewerTheme reflects the stored preference without re-persisting', () => {
    localStorage.setItem('claudepad.viewer-theme', 'slate');
    expect(applyViewerTheme()).toBe('slate');
    expect(attr()).toBe('slate');
  });
});
