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
});
