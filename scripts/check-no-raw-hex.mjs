#!/usr/bin/env node
// PRD-01 FR-6: no raw color hex outside the token source of truth.
// Scans packages/client/src for `#rgb`/`#rrggbb`/`#rrggbbaa` literals in
// .ts/.tsx/.css, allow-listing tokens.css (the single place hex may live).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scanRoot = join(root, 'packages', 'client', 'src');

const ALLOW = new Set([join('styles', 'tokens.css')]);
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const EXT = /\.(tsx?|css)$/;

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(scanRoot)) {
  const rel = relative(scanRoot, file);
  if (ALLOW.has(rel.split('/').join(sep))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (HEX.test(line))
      offenders.push(`${relative(root, file)}:${i + 1}  ${line.trim()}`);
  });
}

if (offenders.length) {
  console.error('Raw color hex found outside tokens.css (PRD-01 FR-6):');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log('check-no-raw-hex: ok (no raw hex outside tokens.css)');
