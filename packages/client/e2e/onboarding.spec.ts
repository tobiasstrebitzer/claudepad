// Onboarding wizard (first-launch). Uses the BASE test (no onboarded-flag seed)
// so the wizard auto-opens, then walks the how-to and the inline identity
// generator, and confirms it doesn't nag again but can be re-run from the sidebar.
import { test, expect } from '@playwright/test';

test.describe('onboarding', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('auto-opens on first launch, creates an identity, and does not reopen', async ({ page }) => {
    await page.goto('/#/');

    // Auto-opens at the welcome step.
    await expect(page.getByRole('heading', { name: 'Welcome to claudepad' })).toBeVisible();

    // Walk the how-to steps to the identity generator.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Bring a session' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Identity step (name only).
    await expect(page.getByRole('heading', { name: 'Create your identity' })).toBeVisible();
    await page.getByLabel('Display name').fill('Tester');
    await page.getByRole('button', { name: 'Create identity' }).click();

    // Minted -> success, then finish.
    await expect(page.getByRole('heading', { name: 'You’re all set' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'You’re all set' })).toBeHidden();

    // The identity is live in the sidebar footer (expanding persists the choice).
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.getByText('Tester')).toBeVisible();

    // It can be re-run from the sidebar...
    await page.getByRole('button', { name: 'Take the tour' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to claudepad' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Welcome to claudepad' })).toBeHidden();

    // ...but does NOT auto-open again on reload (persisted flag).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to claudepad' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Take the tour' })).toBeVisible();
  });
});
