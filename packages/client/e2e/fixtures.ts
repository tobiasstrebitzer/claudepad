// Shared e2e fixture: seed the "already onboarded" flag before each test so the
// first-launch onboarding wizard doesn't auto-open over the flow under test.
// The dedicated onboarding spec imports the base test (no seeding) instead.
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('claudepad.onboarded', 'true'));
    await use(page);
  },
});

export { expect } from '@playwright/test';
