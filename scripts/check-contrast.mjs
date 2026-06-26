#!/usr/bin/env node
// PRD-01 FR-21: automated WCAG contrast check over the documented token pairings,
// in BOTH themes. Parses apps/client/src/styles/tokens.css (the single source
// of color truth) so CI fails if any pairing regresses below target.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(
  new URL('../apps/client/src/styles/tokens.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments so they can't fuse with decls

// Documented pairings - keep in sync with Gallery PAIRINGS. min = AA target.
const PAIRINGS = [
  { fg: '--text', bg: '--bg', min: 4.5, note: 'body on canvas' },
  { fg: '--text', bg: '--surface', min: 4.5, note: 'body on surface' },
  { fg: '--text-muted', bg: '--bg', min: 4.5, note: 'muted on canvas' },
  { fg: '--accent-fg', bg: '--accent', min: 3, note: 'bold label on accent (AA-large)' },
  { fg: '--accent', bg: '--bg', min: 3, note: 'accent on canvas (UI)' },
  { fg: '--success', bg: '--bg', min: 3, note: 'success on canvas' },
  { fg: '--warn', bg: '--bg', min: 3, note: 'warn on canvas' },
  { fg: '--danger', bg: '--bg', min: 3, note: 'danger on canvas' },
  // Data-viz palette (PRD-13): each categorical hue as a chart fill on a card.
  { fg: '--data-1', bg: '--surface', min: 3, note: 'data-1 on surface' },
  { fg: '--data-2', bg: '--surface', min: 3, note: 'data-2 on surface' },
  { fg: '--data-3', bg: '--surface', min: 3, note: 'data-3 on surface' },
  { fg: '--data-4', bg: '--surface', min: 3, note: 'data-4 on surface' },
  { fg: '--data-5', bg: '--surface', min: 3, note: 'data-5 on surface' },
  { fg: '--data-6', bg: '--surface', min: 3, note: 'data-6 on surface' },
];

// Parse every CSS rule into { selector (whitespace-normalized), decls }.
const RULES = [];
{
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1].replace(/\s+/g, ' ').trim();
    const decls = {};
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const name = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      if (name.startsWith('--')) decls[name] = val;
    }
    RULES.push({ selector, decls });
  }
}

// Merge `--name: value` declarations across every rule whose selector satisfies
// `pred` (later rules win, matching CSS source order).
function tokensWhere(pred) {
  const out = {};
  for (const r of RULES) if (pred(r.selector)) Object.assign(out, r.decls);
  return out;
}

// The default `warm` palette = the base mode blocks (no `data-viewer-theme`).
const BASE = {
  light: tokensWhere((s) => s.includes("[data-theme='light']") && !s.includes('data-viewer-theme')),
  dark: tokensWhere((s) => s.includes("[data-theme='dark']") && !s.includes('data-viewer-theme')),
};

// Effective tokens for a palette+mode = base layered with that palette's override.
function effectiveTokens(palette, mode) {
  if (palette === 'warm') return BASE[mode];
  const override = tokensWhere(
    (s) => s.includes(`[data-viewer-theme='${palette}']`) && s.includes(`[data-theme='${mode}']`),
  );
  return { ...BASE[mode], ...override };
}

// Keep in sync with the palette set in apps/client/src/lib/viewer-theme.ts.
const PALETTES = ['warm', 'slate', 'ocean', 'contrast'];
const MODES = ['light', 'dark'];

function parseColor(s) {
  const hex = s.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a,
    };
  }
  const rgba = s.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const p = rgba[1].split(',').map((x) => Number(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  return null;
}

function composite(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function lum({ r, g, b }) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fgRaw, bgRaw) {
  const fg = parseColor(fgRaw);
  const bg = parseColor(bgRaw);
  if (!fg || !bg) return NaN;
  const f = fg.a < 1 ? composite(fg, bg) : fg;
  const l1 = lum(f);
  const l2 = lum(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

let failed = 0;
for (const palette of PALETTES) {
  for (const mode of MODES) {
    const tokens = effectiveTokens(palette, mode);
    for (const p of PAIRINGS) {
      const r = ratio(tokens[p.fg], tokens[p.bg]);
      const ok = r >= p.min;
      if (!ok) {
        failed++;
        console.error(
          `  ✗ [${palette}/${mode}] ${p.note}: ${p.fg} on ${p.bg} = ${r.toFixed(2)} (need ≥ ${p.min})`,
        );
      }
    }
  }
}

if (failed) {
  console.error(`check-contrast: ${failed} pairing(s) below target (PRD-01 FR-21).`);
  process.exit(1);
}
console.log(
  `check-contrast: ok (all documented pairings pass for ${PALETTES.length} palettes × light/dark)`,
);
void root;
