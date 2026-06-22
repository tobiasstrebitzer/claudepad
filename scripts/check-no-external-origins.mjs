#!/usr/bin/env node
// PRD-09 FR-18 / THREAT-MODEL "web hygiene": the built client bundle must make
// no third-party runtime fetches. This scans packages/client/dist for absolute
// external origins (http(s):// and protocol-relative //host) in the shipped
// assets, allow-listing the handful that are inert (schema URLs, SVG xmlns,
// docs/example links rendered as text). A hit here means the bundle could phone
// home - a zero-knowledge regression.
//
// Run after `pnpm build`. If dist/ is absent it skips with a notice (so it can
// live in the lint step without forcing a build).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'packages', 'client', 'dist');

if (!existsSync(dist)) {
  console.log('check-no-external-origins: skipped (no dist/ - run `pnpm build` first)');
  process.exit(0);
}

// Origins that are not network fetches: XML namespaces, JSON-schema ids, and
// the project's own documentation/links (rendered as inert text/attributes).
const ALLOW = [
  'http://www.w3.org/',        // SVG/XML namespaces
  'https://www.w3.org/',
  'http://localhost',          // dev/self-host hints
  'https://localhost',
  'https://claudepad.io',      // own canonical origin (links/meta, not a fetch)
  'https://github.com/',       // repo links in UI text
  'https://developer.mozilla.org/', // doc links in UI text
  'https://tailwindcss.com',   // banner comment in generated CSS
  'https://react.dev/errors/', // React minified-error decoder link (string, not a fetch)
  'https://base-ui.com/production-error', // Base UI minified-error link (string, not a fetch)
];

const SCAN_EXT = new Set(['.js', '.mjs', '.css', '.html']);
const ORIGIN = /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXT.has(extname(name))) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(dist)) {
  const text = readFileSync(file, 'utf8');
  const matches = text.match(ORIGIN) ?? [];
  for (const m of matches) {
    const url = m.startsWith('//') ? 'https:' + m : m;
    if (ALLOW.some((a) => url.startsWith(a))) continue;
    offenders.push(`${relative(root, file)}  ${url.slice(0, 120)}`);
  }
}

if (offenders.length) {
  console.error('External origins found in the client bundle (FR-18 / ZK regression):');
  for (const o of [...new Set(offenders)]) console.error('  ' + o);
  console.error('\nIf one is inert (text/namespace), add it to ALLOW in scripts/check-no-external-origins.mjs.');
  process.exit(1);
}
console.log('check-no-external-origins: ok (bundle makes no third-party fetches)');
