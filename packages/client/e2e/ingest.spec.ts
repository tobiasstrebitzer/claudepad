import { test, expect } from '@playwright/test';

// P1 MVP-0 (PRD-03 + PRD-04): drop/paste → see it beautifully, fully offline.

test.describe('ingest + viewer', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('empty state offers drop, paste, and onboarding', async ({ page }) => {
    await page.goto('/#/');
    await expect(
      page.getByRole('heading', { name: /Drop a session to begin/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose file/ })).toBeVisible();
    // OS-aware onboarding disclosure.
    await page.getByText('Where are my Claude Code sessions?').click();
    await expect(
      page.getByText('~/.claude/projects', { exact: false }).first(),
    ).toBeVisible();
  });

  test('loads the sample session and renders the prettified viewer', async ({ page }) => {
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    // Header + local-only banner.
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();
    await expect(page.getByText('local only')).toBeVisible();
    // Secret placeholder is masked — the raw token never leaks.
    await expect(page.getByText(/AWS_KEY ••••••••\(20\)/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('cp-secret');
    // Clear returns to the empty state.
    await page.getByRole('button', { name: 'Clear session' }).click();
    await expect(
      page.getByRole('heading', { name: /Drop a session to begin/ }),
    ).toBeVisible();
  });

  test('non-session input is rejected with guidance (FR-6)', async ({ page }) => {
    await page.goto('/#/');
    // Pick a prose file (not a session) → friendly rejection, never a crash.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('just some notes I copied from a doc, not a session'),
    });
    await expect(
      page.getByRole('heading', { name: /doesn’t look like a Claude Code session/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('heading', { name: /Drop a session to begin/ }),
    ).toBeVisible();
  });

  test('renders with no external network (offline / no-phone-home, FR-25)', async ({
    page,
  }) => {
    const external: string[] = [];
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        external.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();
    // The code block highlights from a bundled grammar — still no external fetch.
    await expect(
      external,
      `unexpected external requests: ${external.join(', ')}`,
    ).toHaveLength(0);
  });
});
