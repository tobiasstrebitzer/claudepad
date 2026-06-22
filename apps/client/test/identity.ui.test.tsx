import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { fingerprint } from '@claudepad/crypto';
import { Fingerprint } from '../src/identity/Fingerprint';
import { IdentityProvider } from '../src/identity/IdentityProvider';
import { IdentityControl } from '../src/identity/IdentityControl';
import type { IdentityStorage } from '../src/identity/storage';

afterEach(cleanup);

const empty: IdentityStorage = {
  load: () => Promise.resolve(undefined),
  save: () => Promise.resolve(),
  clear: () => Promise.resolve(),
};

describe('Fingerprint badge (FR-11/FR-12)', () => {
  it('always shows the hex code beside the emoji', async () => {
    const { code } = await fingerprint('AAAA');
    render(<Fingerprint pub="AAAA" />);
    // The accessible hex code is present (the emoji-blind fallback, FR-12).
    await waitFor(() => expect(screen.getByText(code)).toBeInTheDocument());
    expect(screen.getByLabelText(`Fingerprint ${code}`)).toBeInTheDocument();
  });
});

describe('IdentityControl trigger', () => {
  it('prompts to set up an identity when none exists (FR-7)', async () => {
    render(
      <IdentityProvider storage={empty}>
        <IdentityControl />
      </IdentityProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('Set up your identity')).toBeInTheDocument(),
    );
  });
});
