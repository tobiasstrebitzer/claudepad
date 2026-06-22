import { test, expect } from '@playwright/test';

// P3 share flow (PRD-11 + PRD-06): mint an identity, open Share, and verify the
// review step - the off-main-thread scan lands and the advanced review controls
// (sensitivity presets, detection-quality disclosure, bulk actions) render. The
// address-book round-trip and crypto are unit-tested; this guards the wiring.

test.describe('share', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('mints an identity and shows the advanced review controls', async ({ page }) => {
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();

    // Mint an identity from the sidebar footer.
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.getByRole('button', { name: /Set up your identity/ }).click();
    await page.getByLabel('Display name').fill('Tester');
    await page.getByRole('button', { name: 'Create' }).click();
    // Popover now shows the unlocked identity; dismiss it.
    await page.keyboard.press('Escape');

    // Open Share -> the review step.
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByRole('heading', { name: 'Review before sharing' })).toBeVisible();

    // Scan completes (the worker), and at least one detection appears.
    await expect(page.getByText(/will be redacted/)).toBeVisible();

    // Detection-quality disclosure (FR-32).
    await expect(page.getByText('How good is detection?')).toBeVisible();

    // Sensitivity presets - Balanced is the default; switching re-scans.
    await expect(page.getByRole('button', { name: 'Balanced', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aggressive' }).click();
    await expect(page.getByRole('button', { name: 'Aggressive', pressed: true })).toBeVisible();

    // The sample is pre-redacted (no raw secrets), so add one by hand - this also
    // surfaces the bulk actions, which only appear once there's something to act on.
    await page.getByPlaceholder('Add a value the scanner missed…').fill('hunter2-very-secret-x9');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('1 will be redacted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss all' })).toBeVisible();

    // Bulk dismiss + hide-dismissed filter.
    await page.getByRole('button', { name: 'Dismiss all' }).click();
    await expect(page.getByText('0 will be redacted')).toBeVisible();
  });

  test('encrypts end-to-end to a recipient and remembers them', async ({ page }) => {
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();

    // Mint an identity, then grab its own public card (share-to-self round-trip).
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.getByRole('button', { name: /Set up your identity/ }).click();
    await page.getByLabel('Display name').fill('Tester');
    await page.getByRole('button', { name: 'Create' }).click();
    const card = await page
      .locator('code')
      .filter({ hasText: 'cp-pub-' })
      .first()
      .textContent();
    expect(card).toMatch(/^cp-pub-/);
    await page.keyboard.press('Escape');

    // Review -> acknowledge -> recipient.
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByRole('heading', { name: 'Review before sharing' })).toBeVisible();
    await page.getByRole('checkbox').first().check(); // the ack checkbox
    await page.getByRole('button', { name: 'Continue' }).click();

    // Add the recipient (ourselves), confirm the fingerprint, add to the list.
    await expect(page.getByRole('heading', { name: 'Share with…' })).toBeVisible();
    await page.getByPlaceholder('cp-pub-…').fill(card!);
    await page.getByRole('checkbox').check(); // fingerprint-match confirmation
    await page.getByRole('button', { name: 'Add recipient' }).click();
    await expect(page.getByText('1 added')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Grant -> encrypt -> a cp-blob result.
    await page.getByRole('button', { name: /Encrypt for Tester/ }).click();
    await expect(page.getByRole('heading', { name: /Encrypted for Tester/ })).toBeVisible();
    await expect(page.getByText(/^cp-blob-/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // The recipient is now remembered: reopening Share lists them.
    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Recent recipients')).toBeVisible();
    await expect(page.getByText('Tester').first()).toBeVisible();
  });
});
