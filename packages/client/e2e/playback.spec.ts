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

  // Perf smoke (PRD-08 Q-5 / FR-20): a >= 5k-event session must load, enter
  // playback, and seek end-to-end without hanging. The engine is O(n)/O(log n)
  // (covered by playback.perf.test.ts); this guards the rendered surface +
  // virtualization at scale.
  test('drives playback over a >= 5k-event session', async ({ page }) => {
    const TURNS = 5200;
    const lines: string[] = [];
    for (let i = 0; i < TURNS; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      const content = role === 'user' ? `prompt ${i}` : `reply ${i} ${'detail '.repeat(8)}`;
      lines.push(JSON.stringify({ type: role, message: { role, content } }));
    }
    const buffer = Buffer.from(lines.join('\n'));

    await page.goto('/?play=1#/');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'long-session.jsonl',
      mimeType: 'application/json',
      buffer,
    });

    // Auto-enters playback (?play=1); the transport + scrubber mount at scale.
    const transport = page.getByRole('group', { name: 'Playback transport' });
    await expect(transport).toBeVisible({ timeout: 15000 });
    const scrubber = page.getByRole('slider', { name: 'Playback timeline' });
    await expect(scrubber).toHaveAttribute('aria-valuetext', /event \d+ of \d+/);

    // Seek to the very end (End key) - the last event becomes active without hang.
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.keyboard.press('End');
    await expect(scrubber).toHaveAttribute('aria-valuetext', /event (\d+) of \1/, {
      timeout: 10000,
    });
  });
});
