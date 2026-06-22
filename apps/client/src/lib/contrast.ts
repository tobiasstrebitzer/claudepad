/**
 * WCAG 2.1 contrast helpers (PRD-01 FR-9/FR-21). Pure, dependency-free, shared by
 * the gallery readouts and scripts/check-contrast.mjs. Supports #rgb/#rrggbb/#rrggbbaa
 * and rgba() with alpha composited over an opaque background.
 */

export interface RGB { r: number; g: number; b: number; a: number }

export function parseColor(input: string): RGB | null {
  const s = input.trim()
  const hex = s.match(/^#([0-9a-f]{3,8})$/i)
  if (hex?.[1]) {
    let h = hex[1]
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    if (h.length === 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    if (h.length !== 6 && h.length !== 8) return null
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  const rgba = s.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba?.[1]) {
    const parts = rgba[1].split(',').map((p) => p.trim())
    if (parts.length < 3) return null
    const r = Number(parts[0])
    const g = Number(parts[1])
    const b = Number(parts[2])
    const a = parts[3] !== undefined ? Number(parts[3]) : 1
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
    return { r, g, b, a }
  }
  return null
}

/** Composite a possibly-translucent color over an opaque background. */
export function composite(fg: RGB, bg: RGB): RGB {
  const a = fg.a
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  }
}

function relLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio (1..21). Alpha on `fg` is composited over `bg`. */
export function contrastRatio(fg: string, bg: string): number {
  const f = parseColor(fg)
  const b = parseColor(bg)
  if (!f || !b) return NaN
  const fc = f.a < 1 ? composite(f, b) : f
  const l1 = relLuminance(fc)
  const l2 = relLuminance(b)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

export const ratioLabel = (r: number): string => (Number.isNaN(r) ? '-' : r.toFixed(2))
