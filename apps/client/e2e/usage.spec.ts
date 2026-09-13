import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, expect } from './fixtures';

// PRD-13 FR-15: open #/usage, feed it a real session via the drop fallback
// (no folder-connect needed in the headless run), and assert the dashboard
// renders cards + a chart + the project table.

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'test', 'schema', 'fixtures', 'real-2.1.177.jsonl');

test.describe('usage insights', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('connect prompt offers drop fallback', async ({ page }) => {
    await page.goto('/#/usage');
    await expect(page.getByRole('heading', { name: 'Usage Insights' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Drop session files/ })).toBeVisible();
  });

  test('renders the dashboard from a dropped session', async ({ page }) => {
    await page.goto('/#/usage');
    await page.getByTestId('usage-file-input').setInputFiles(FIXTURE);

    // Metric cards.
    await expect(page.getByText('Total tokens')).toBeVisible();
    await expect(page.getByText('Est. cost').first()).toBeVisible();
    await expect(page.getByText('Active days')).toBeVisible();

    // A chart panel and the project table.
    await expect(page.getByRole('heading', { name: 'Tokens over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Models' })).toBeVisible();
    // Recharts renders an SVG surface for the trend + model + histogram charts.
    await expect(page.locator('.recharts-surface').first()).toBeVisible();

    // The date-range control and project dropdown are in the top bar.
    await expect(page.getByRole('button', { name: 'All time' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Global - all projects/ })).toBeVisible();
  });

  test('surfaces how the work ran, not just how much', async ({ page }) => {
    await page.goto('/#/usage');
    await page.getByTestId('usage-file-input').setInputFiles(FIXTURE);

    // Parallelism + delegation are first-class panels, with the "at once" card.
    await expect(page.getByRole('heading', { name: 'Sessions in parallel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delegation' })).toBeVisible();
    await expect(page.getByText('At once', { exact: true })).toBeVisible();

    // A single dropped session has no subagent runs and no limit hits - both
    // panels must say so plainly rather than render an empty chart.
    await expect(page.getByText('No subagent runs in range.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Limit hits' })).toBeVisible();
    await expect(page.getByText(/No limit hits in range/)).toBeVisible();
    // Honesty: the limits panel says why there is no headroom gauge.
    await expect(page.getByText(/remaining\s+quota is never written/)).toBeVisible();
  });

  // Dev-gated (VITE_QUOTA_PANEL): the Playwright server runs `vite` in dev, so
  // the panel is on here. A production bundle ships without it.
  test('separates what the plan meters from what the API would charge', async ({ page }) => {
    await page.goto('/#/usage');
    await page.getByTestId('usage-file-input').setInputFiles(FIXTURE);

    const quota = page.locator('section').filter({ hasText: 'what your subscription actually meters' });
    await expect(quota.getByRole('heading', { name: 'Rate limits' })).toBeVisible();
    await expect(quota.getByText('counted against your limits')).toBeVisible();
    // The headline claim: cache reads are excluded from the meter.
    await expect(quota.getByText(/is cache reads/)).toBeVisible();

    // Budgets are editable and labelled as reverse-engineered, not official.
    await expect(quota.getByText('5h budget')).toBeVisible();
    await expect(quota.getByText(/Reverse-engineered from 5 weeks/)).toBeVisible();

    // No quota log connected -> an import affordance, and no measured readings.
    await expect(quota.getByRole('button', { name: 'Import' })).toBeVisible();
    await expect(quota.getByText(/^measured \d+%$/)).toHaveCount(0);
    await expect(quota.getByText(/readings/)).toHaveCount(0);
  });
});
