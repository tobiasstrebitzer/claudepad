import { test, expect } from './fixtures';

// P3 share flow (PRD-11), reworked: one recipient step (paste a key to insta-add,
// tier toggle in the footer), then - with no registry connected - an encrypted
// blob result. The scan/redaction internals are unit-tested; this guards the
// wiring of the current dialog.

test.describe('share', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // Mint a local identity from the sidebar (no registry), returning its public card.
  async function mintIdentity(page: import('@playwright/test').Page) {
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    await expect(page.getByRole('heading', { name: 'Refactor the auth module' })).toBeVisible();

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.getByRole('button', { name: /Set up your identity/ }).click();
    await page.getByLabel('Display name').fill('Tester');
    await page.getByRole('button', { name: 'Create' }).click();
    const card = await page.locator('code').filter({ hasText: 'cp-pub-' }).first().textContent();
    expect(card).toMatch(/^cp-pub-/);
    await page.keyboard.press('Escape');
    return card!;
  }

  test('pastes a recipient (insta-add) and offers the tier toggle', async ({ page }) => {
    const card = await mintIdentity(page);
    const dialog = page.getByRole('dialog');

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Share with…' })).toBeVisible();

    // Pasting a valid key adds it immediately (no confirm) and clears the field.
    await page.getByPlaceholder(/cp-pub/).fill(card);
    await expect(dialog.getByText('Tester')).toBeVisible();
    await expect(page.getByPlaceholder(/cp-pub/)).toHaveValue('');

    // Tier lives in the footer; the sample is pre-redacted so body+secrets is off.
    await expect(dialog.getByRole('button', { name: 'Body only' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Body \+ secrets/ })).toBeDisabled();
  });

  test('encrypts end-to-end to a recipient and remembers them', async ({ page }) => {
    const card = await mintIdentity(page);
    const dialog = page.getByRole('dialog');

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByPlaceholder(/cp-pub/).fill(card);
    await expect(dialog.getByText('Tester')).toBeVisible();

    // No raw secrets in the sample -> body-only needs no review -> straight to result.
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Encrypted for Tester/ })).toBeVisible();
    // With no registry connected, the artifact is the blob (copy/download), no link.
    await expect(page.getByRole('button', { name: /Copy blob/ })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // The recipient is now remembered: reopening Share lists them.
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('Recent recipients')).toBeVisible();
    await expect(dialog.getByText('Tester')).toBeVisible();
  });
});
