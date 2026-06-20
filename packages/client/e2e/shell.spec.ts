import { test, expect } from '@playwright/test';

// PRD-01 FR-14/FR-15/FR-3: the app-shell layout, responsive sidebar collapse,
// and theme switching, verified in a real browser.

test.describe('app shell — desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows the persistent sidebar, hides the menu button', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByRole('navigation', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
    await expect(
      page.getByRole('heading', { name: /Drop a session to begin/ }),
    ).toBeVisible();
  });

  test('theme toggle flips <html data-theme>', async ({ page }) => {
    // Seed an explicit "light" preference so the first cycle (light → dark) is a
    // deterministic flip (cycling through "system" can resolve back to light).
    await page.addInitScript(() => localStorage.setItem('claudepad.theme', 'light'));
    await page.goto('/#/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: /theme/i }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('app shell — mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test('collapses the sidebar into an off-canvas drawer', async ({ page }) => {
    await page.goto('/#/');
    // Sidebar is collapsed; the menu button is the way in.
    await expect(page.getByRole('navigation', { name: 'Sessions' })).toBeHidden();
    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();

    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Sessions' })).toBeVisible();
  });
});

test('gallery route renders the design system', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/gallery');
  await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible();
  await expect(page.getByText('Color tokens')).toBeVisible();
  await expect(page.getByText('Contrast (WCAG)')).toBeVisible();
});
