import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AppShell } from '../src/components/shell/AppShell';
import { IdentityProvider } from '../src/identity';
import type { IdentityStorage } from '../src/identity';
import { Home } from '../src/pages/Home';

afterEach(cleanup);

// The sidebar footer hosts the identity control, which needs the provider.
const noStorage: IdentityStorage = {
  load: () => Promise.resolve(undefined),
  save: () => Promise.resolve(),
  clear: () => Promise.resolve(),
};

// FR-3: switching theme is a single data-theme flip on <html> with NO component
// code change and NO DOM-structure diff — only computed styles differ (and CSS
// cascade isn't exercised in jsdom, so structural equality is the assertion).
describe('theme swap (FR-3)', () => {
  it('flipping data-theme does not change the rendered DOM structure', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { container } = render(
      <IdentityProvider storage={noStorage}>
        <AppShell route="#/" recent={[{ id: 'a', title: 'Session A' }]} activeId="a">
          <Home />
        </AppShell>
      </IdentityProvider>,
    );
    const before = container.innerHTML;

    document.documentElement.setAttribute('data-theme', 'dark');
    const after = container.innerHTML;

    expect(after).toBe(before);
  });
});
