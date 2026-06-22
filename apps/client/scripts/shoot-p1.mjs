import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4317';
const OUT = '/tmp/cp-shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function page(theme, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  const p = await ctx.newPage();
  await p.addInitScript((t) => localStorage.setItem('claudepad.theme', t), theme);
  return { ctx, p };
}

// Empty / ingest state
for (const theme of ['light', 'dark']) {
  const { ctx, p } = await page(theme, 1280, 860);
  await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/ingest-${theme}.png` });
  // open the "where are my sessions" disclosure for a fuller shot
  await p
    .getByText('Where are my Claude Code sessions?')
    .click()
    .catch(() => {});
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/ingest-open-${theme}.png` });
  await ctx.close();
}

// Loaded viewer (sample session)
for (const theme of ['light', 'dark']) {
  const { ctx, p } = await page(theme, 1280, 900);
  await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await p.getByText('Or explore a sample session').click();
  await p.waitForTimeout(900); // let highlight + layout settle
  await p.screenshot({ path: `${OUT}/viewer-${theme}.png` });
  await ctx.close();
}

await browser.close();
console.log('done →', OUT);
