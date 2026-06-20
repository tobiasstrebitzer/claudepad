import { test, expect } from '@playwright/test';

// P4 playback (PRD-08): toggle into playback from the viewer, drive the transport,
// exit back to the static viewer. Pure client-side over the in-memory session.

test.describe('playback', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('plays the sample session, scrubs, and exits', async ({ page }) => {
    await page.goto('/#/');
    await page.getByText('Or explore a sample session').click();
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();

    // Enter playback from the top-bar Play affordance.
    const play = page.getByRole('button', { name: 'Play session' });
    await expect(play).toBeVisible();
    await play.click();

    // Transport bar mounts; it starts playing (button offers Pause).
    const transport = page.getByRole('group', { name: 'Playback transport' });
    await expect(transport).toBeVisible();
    await expect(transport.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Scrubber is an ARIA slider with descriptive value text.
    const scrubber = page.getByRole('slider', { name: 'Playback timeline' });
    await expect(scrubber).toBeVisible();
    await expect(scrubber).toHaveAttribute('aria-valuetext', /event \d+ of \d+/);

    // Pause freezes it; the button flips back to Play.
    await transport.getByRole('button', { name: 'Pause' }).click();
    await expect(transport.getByRole('button', { name: /^Play$/ })).toBeVisible();

    // Esc exits playback → transport gone, static viewer fully revealed again.
    await page.keyboard.press('Escape');
    await expect(transport).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Refactor the auth module' }),
    ).toBeVisible();
  });

  test('opens straight into playback from a deep link and reflects settings', async ({
    page,
  }) => {
    await page.goto('/?play=1&mode=present&speed=2#/');
    await page.getByText('Or explore a sample session').click();
    await expect(page.getByRole('group', { name: 'Playback transport' })).toBeVisible();

    // The deep-linked 2× / presentation are reflected in the settings popover.
    await page.getByRole('button', { name: 'Playback settings' }).click();
    await expect(page.getByRole('button', { name: '2×', pressed: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Presentation', pressed: true }),
    ).toBeVisible();
  });

  test('typing appear streams the active turn', async ({ page }) => {
    await page.goto('/?play=1&appear=type#/');
    await page.getByText('Or explore a sample session').click();
    await expect(page.getByRole('group', { name: 'Playback transport' })).toBeVisible();
    // The active turn types out - a caret is visible while prose streams.
    await expect(page.getByText('▍').first()).toBeVisible();
  });
});
