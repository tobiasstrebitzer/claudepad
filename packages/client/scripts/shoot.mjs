import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4317';
const OUT = '/tmp/cp-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { hash, theme, width, height, full = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  // Force the preference so the no-flash head script applies it deterministically.
  await page.addInitScript((t) => localStorage.setItem('claudepad.theme', t), theme);
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350); // let webfonts settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await ctx.close();
  console.log('shot', name);
}

await shot('home-light', { hash: '#/', theme: 'light', width: 1280, height: 820 });
await shot('home-dark', { hash: '#/', theme: 'dark', width: 1280, height: 820 });
await shot('gallery-light', {
  hash: '#/gallery',
  theme: 'light',
  width: 1280,
  height: 1500,
  full: true,
});
await shot('gallery-dark', {
  hash: '#/gallery',
  theme: 'dark',
  width: 1280,
  height: 1500,
  full: true,
});
await shot('home-mobile', { hash: '#/', theme: 'light', width: 390, height: 780 });

await browser.close();
console.log('done →', OUT);
