/**
 * Viewer theme module (the aesthetic palette axis, distinct from the functional
 * light/dark mode in lib/theme.ts). A palette is purely a token-override block in
 * tokens.css selected by a single `<html data-viewer-theme>` attribute - no
 * component recomputation, and it composes with `data-theme` (palette × mode).
 * The only persisted, non-sensitive state is the preference in
 * localStorage["claudepad.viewer-theme"]. Default is the warm-minimal base.
 */

export type ViewerTheme = 'warm' | 'slate' | 'ocean' | 'contrast'

const STORAGE_KEY = 'claudepad.viewer-theme'
const DEFAULT: ViewerTheme = 'warm'

// Keep in sync with tokens.css palette blocks and scripts/check-contrast.mjs.
export const VIEWER_THEMES: readonly ViewerTheme[] = ['warm', 'slate', 'ocean', 'contrast']
const VALID: ReadonlySet<string> = new Set(VIEWER_THEMES)

/** Read the stored palette; unset/unknown → "warm". */
export function getViewerTheme(): ViewerTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && VALID.has(raw)) return raw as ViewerTheme
  } catch {
    /* storage unavailable (SSR/private mode) → default */
  }
  return DEFAULT
}

/** Apply the palette to <html data-viewer-theme>. Pure DOM write, no re-render. */
export function applyViewerTheme(theme: ViewerTheme = getViewerTheme()): ViewerTheme {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-viewer-theme', theme)
  }
  return theme
}

/** Persist + apply a new palette preference. */
export function setViewerTheme(theme: ViewerTheme): ViewerTheme {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore persistence failures */
  }
  return applyViewerTheme(theme)
}
