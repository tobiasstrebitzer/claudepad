#!/usr/bin/env node
// PRD-01 FR-21: automated WCAG contrast check over the documented token pairings,
// in BOTH themes. Parses packages/client/src/styles/tokens.css (the single source
// of color truth) so CI fails if any pairing regresses below target.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(
  new URL('../packages/client/src/styles/tokens.css', import.meta.url),
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
];

// Extract a `--name: value;` map from the body of the FIRST CSS rule whose
// selector text contains `selectorIncludes`.
function tokensFor(selectorIncludes) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  const out = {};
  while ((m = re.exec(css))) {
    if (!m[1].includes(selectorIncludes)) continue;
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const name = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      if (name.startsWith('--')) out[name] = val;
    }
  }
  return out;
}

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

const THEMES = {
  light: tokensFor("[data-theme='light']"),
  dark: tokensFor("[data-theme='dark']"),
};

let failed = 0;
for (const [theme, tokens] of Object.entries(THEMES)) {
  for (const p of PAIRINGS) {
    const r = ratio(tokens[p.fg], tokens[p.bg]);
    const ok = r >= p.min;
    if (!ok) {
      failed++;
      console.error(
        `  ✗ [${theme}] ${p.note}: ${p.fg} on ${p.bg} = ${r.toFixed(2)} (need ≥ ${p.min})`,
      );
    }
  }
}

if (failed) {
  console.error(`check-contrast: ${failed} pairing(s) below target (PRD-01 FR-21).`);
  process.exit(1);
}
console.log('check-contrast: ok (all documented pairings pass in light + dark)');
void root;
