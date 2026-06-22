import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { Markdown } from '../src/viewer/components/blocks/Markdown';
import { SecretText } from '../src/viewer/components/blocks/SecretText';
import { RevealProvider } from '../src/viewer/hooks/useReveal';
import { makeSecretToken } from '../src/viewer/secret-token';

afterEach(cleanup);

const token = makeSecretToken({ id: 's1', type: 'AWS_KEY', len: 20 });

describe('secret placeholder integration through Markdown (FR-19)', () => {
  it('renders the masked chip - not the raw token - for prose text', () => {
    render(
      <RevealProvider>
        <Markdown text={`Deploy uses key ${token} for staging.`} />
      </RevealProvider>,
    );
    // The masked chip is shown…
    expect(screen.getByText(/AWS_KEY ••••••••\(20\)/)).toBeInTheDocument();
    // …and the raw token text never leaks into the DOM.
    expect(document.body.textContent).not.toContain('cp-secret');
    expect(document.body.textContent).not.toContain('⟦');
  });

  it('hides the real value when no secret map is supplied', () => {
    render(
      <RevealProvider>
        <Markdown text={`key ${token}`} />
      </RevealProvider>,
    );
    expect(document.body.textContent).not.toContain('AKIA');
  });

  it('SecretText handles inline-code placeholders directly', () => {
    render(
      <RevealProvider>
        <SecretText>{`x=${token}`}</SecretText>
      </RevealProvider>,
    );
    expect(screen.getByText(/AWS_KEY ••••••••\(20\)/)).toBeInTheDocument();
  });
});
