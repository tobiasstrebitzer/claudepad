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
  it('shows emoji by default, with the hex code in the accessible label', async () => {
    const { emoji, code } = await fingerprint('AAAA');
    render(<Fingerprint pub="AAAA" />);
    // Default surface is emoji; the exact hex code stays in the aria-label as the
    // emoji-blind/screen-reader fallback (FR-12).
    await waitFor(() => expect(screen.getByText(emoji)).toBeInTheDocument());
    expect(screen.getByLabelText(`Fingerprint ${code}`)).toBeInTheDocument();
    // The hex isn't rendered as its own visible node by default.
    expect(screen.queryByText(code)).not.toBeInTheDocument();
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
