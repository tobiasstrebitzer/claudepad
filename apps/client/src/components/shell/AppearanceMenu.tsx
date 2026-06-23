import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/cn'
import {
  getTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type ResolvedTheme,
  type Theme
} from '../../lib/theme'
import {
  getViewerTheme,
  setViewerTheme,
  VIEWER_THEMES,
  type ViewerTheme
} from '../../lib/viewer-theme'
import { Button } from '../ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'

const MODE_ICON: Record<Theme, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor
}
const MODE_LABEL: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System'
}
const PALETTE_LABEL: Record<ViewerTheme, string> = {
  warm: 'Warm',
  slate: 'Slate',
  ocean: 'Ocean',
  contrast: 'Contrast'
}

// One "Appearance" surface: functional light/dark/system mode AND the aesthetic
// palette (viewer theme). Both apply via a single attribute flip on <html> and
// persist to localStorage. Replaces the old standalone ThemeToggle (FR-3/FR-4).
export function AppearanceMenu() {
  const [theme, setThemeState] = React.useState<Theme>(() => getTheme())
  const [palette, setPaletteState] = React.useState<ViewerTheme>(() => getViewerTheme())

  // Keep the mode label/swatch preview in sync when the OS theme changes while "system".
  React.useEffect(() => watchSystemTheme(() => setThemeState(getTheme())), [])

  const resolved: ResolvedTheme = resolveTheme(theme)

  const pickMode = (m: Theme) => {
    setTheme(m)
    setThemeState(m)
  }
  const pickPalette = (p: ViewerTheme) => {
    setViewerTheme(p)
    setPaletteState(p)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Appearance" title="Appearance">
            <Palette />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-70 gap-3.5 p-3">
        <div role="group" aria-label="Mode" className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.02em] text-muted-foreground">Mode</span>
          <div className="flex gap-1">
            {(['light', 'dark', 'system'] as const).map((m) => {
              const Icon = MODE_ICON[m]
              const active = theme === m
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickMode(m)}
                  className={cn(
                    'inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-body-sm transition-colors',
                    active
                      ? 'border-accent bg-accent-tint text-accent'
                      : 'border-border text-text hover:bg-accent-tint'
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{MODE_LABEL[m]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div role="group" aria-label="Palette" className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.02em] text-muted-foreground">
            Palette
          </span>
          <div className="grid grid-cols-2 gap-1">
            {VIEWER_THEMES.map((p) => {
              const active = palette === p
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickPalette(p)}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-body-sm transition-colors',
                    active
                      ? 'border-accent bg-accent-tint text-accent'
                      : 'border-border text-text hover:bg-accent-tint'
                  )}
                >
                  {/* Live swatch: both data attributes on the span so the palette's
                      own tokens resolve here (selector needs both), keeping JSX hex-free. */}
                  <span
                    aria-hidden
                    data-viewer-theme={p}
                    data-theme={resolved}
                    className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border"
                    style={{ background: 'var(--bg)' }}
                  >
                    <span className="size-2 rounded-full" style={{ background: 'var(--accent)' }} />
                  </span>
                  <span className="flex-1 truncate text-left">{PALETTE_LABEL[p]}</span>
                  {active && <Check className="size-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
