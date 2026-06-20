/**
 * Theme module (PRD-01 §7.6, FR-3/FR-4). Light is default; `system` resolves via
 * matchMedia and falls back to light. The only persisted, non-sensitive state is
 * the preference in localStorage["claudepad.theme"]. Switching theme toggles a
 * single `data-theme` attribute on <html> - no component style recomputation.
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'claudepad.theme';
const VALID: ReadonlySet<string> = new Set(['light', 'dark', 'system']);

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Read the stored preference; unset/unknown → "system" (FR-4). */
export function getTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.has(raw)) return raw as Theme;
  } catch {
    /* storage unavailable (SSR/private mode) → default */
  }
  return 'system';
}

/** Resolve a preference to an applied light/dark value (system → matchMedia, fallback light). */
export function resolveTheme(theme: Theme = getTheme()): ResolvedTheme {
  if (theme === 'system') return prefersDark() ? 'dark' : 'light';
  return theme;
}

/** Apply the resolved theme to <html data-theme>. Pure DOM write, no re-render. */
export function applyResolvedTheme(theme: Theme = getTheme()): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  return resolved;
}

/** Persist + apply a new preference (FR-4). */
export function setTheme(theme: Theme): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore persistence failures */
  }
  return applyResolvedTheme(theme);
}

/**
 * Subscribe to OS theme changes while the preference is "system".
 * Returns an unsubscribe fn. No-op outside the browser.
 */
export function watchSystemTheme(
  onChange: (resolved: ResolvedTheme) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getTheme() === 'system') onChange(applyResolvedTheme('system'));
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
