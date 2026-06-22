import type { HighlighterCore } from 'shiki/core'

// Curated, BUNDLED language subset + a SINGLE theme, loaded via Shiki's
// FINE-GRAINED core (shiki/core) with the pure-JS regex engine - so the static
// build includes ONLY these grammars (no 100+ unused language chunks) and NO
// oniguruma wasm. Everything is bundled (dynamic-imported from the local build),
// so highlighting works fully offline (FR-25). Unknown langs fall back to plaintext.
// (Addresses PRD-03 Q-3 - the Shiki bundle footprint.)

// Dual themes so code follows the app's light/dark mode. Shiki emits per-token
// `--shiki-light`/`--shiki-dark` CSS vars (no inline color/background), and CSS
// in globals.css switches them off the `<html data-theme>` attribute.
export const BUNDLED_THEMES = { light: 'github-light', dark: 'github-dark' } as const

// Short request names accepted by callers; aliases below normalize to these.
export const BUNDLED_LANGS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'bash',
  'shell',
  'python',
  'css',
  'html',
  'markdown',
  'diff',
  'yaml'
] as const

const LANG_SET = new Set<string>(BUNDLED_LANGS)

const LANG_ALIASES: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  sh: 'bash',
  zsh: 'bash',
  shellscript: 'bash',
  shell: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
  htm: 'html'
}

/** Normalize a requested lang to a registered grammar/alias, or null for plaintext. */
export function resolveLang(lang: string | undefined): string | null {
  if (!lang) return null
  const lower = lang.toLowerCase().trim()
  const aliased = LANG_ALIASES[lower] ?? lower
  return LANG_SET.has(aliased) ? aliased : null
}

let highlighterPromise: Promise<HighlighterCore> | null = null

/** Lazily create (once) the shared core highlighter. Never blocks first paint. */
export async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [
        { createHighlighterCore },
        { createJavaScriptRegexEngine },
        themeLight,
        themeDark,
        ...langs
      ] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('@shikijs/themes/github-light'),
        import('@shikijs/themes/github-dark'),
        // Only these grammars get bundled (each registers its own aliases, e.g. ts/js).
        import('@shikijs/langs/typescript'),
        import('@shikijs/langs/tsx'),
        import('@shikijs/langs/javascript'),
        import('@shikijs/langs/jsx'),
        import('@shikijs/langs/json'),
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/python'),
        import('@shikijs/langs/css'),
        import('@shikijs/langs/html'),
        import('@shikijs/langs/markdown'),
        import('@shikijs/langs/diff'),
        import('@shikijs/langs/yaml')
      ])
      return createHighlighterCore({
        themes: [themeLight.default, themeDark.default],
        langs: langs.map((m) => m.default),
        engine: createJavaScriptRegexEngine()
      })
    })()
  }
  return highlighterPromise
}

/**
 * Highlight `code` → HTML string, or return null when not highlightable (unknown
 * lang or highlighter unavailable). The caller renders plain mono first and
 * upgrades on resolve.
 */
export async function highlightToHtml(
  code: string,
  lang: string | undefined
): Promise<string | null> {
  const resolved = resolveLang(lang)
  if (!resolved) return null
  try {
    const hl = await getHighlighter()
    // Dual-theme output with no default color → only `--shiki-light`/`--shiki-dark`
    // CSS vars on each token (and no inline background), so globals.css can switch
    // the palette by `data-theme` and the container's themed background shows through.
    return hl.codeToHtml(code, {
      lang: resolved,
      themes: BUNDLED_THEMES,
      defaultColor: false
    })
  } catch {
    return null
  }
}
