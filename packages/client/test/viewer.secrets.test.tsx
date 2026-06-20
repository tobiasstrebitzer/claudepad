import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RevealProvider, type SecretMap } from '../src/viewer/hooks/useReveal';
import { SecretText } from '../src/viewer/components/blocks/SecretText';
import { makeSecretToken, splitSecretTokens } from '../src/viewer/secret-token';

const TOKEN = makeSecretToken({ id: 's1', type: 'AWS_KEY', len: 20 });
const REAL = 'AKIAIOSFODNN7EXAMPLE';
const MAP: SecretMap = { s1: { type: 'AWS_KEY', value: REAL } };

function renderText(text: string, secretMap?: SecretMap) {
  return render(
    <RevealProvider secretMap={secretMap}>
      <SecretText>{text}</SecretText>
    </RevealProvider>,
  );
}

describe('splitSecretTokens', () => {
  it('splits text and placeholder segments', () => {
    const segs = splitSecretTokens(`key ${TOKEN} done`);
    expect(segs.map((s) => s.kind)).toEqual(['text', 'secret', 'text']);
    expect(segs[1]).toMatchObject({
      kind: 'secret',
      placeholder: { id: 's1', type: 'AWS_KEY', len: 20 },
    });
  });

  it('returns a single text segment when there is no token', () => {
    const segs = splitSecretTokens('plain text');
    expect(segs).toEqual([{ kind: 'text', text: 'plain text' }]);
  });
});

describe('SecretText chip rendering', () => {
  it('renders placeholder chip with type + length, no value', () => {
    renderText(`use ${TOKEN}`);
    const chip = screen.getByText(/AWS_KEY/);
    expect(chip.textContent).toContain('(20)');
    expect(chip.textContent).toContain('••••••••');
    // No real value substring is present anywhere.
    expect(document.body.textContent).not.toContain(REAL);
    expect(document.body.textContent).not.toContain(REAL.slice(0, 4));
  });

  it('shows NO reveal affordance without a secret map', () => {
    renderText(`use ${TOKEN}`);
    expect(screen.queryByLabelText(/Reveal AWS_KEY/)).not.toBeInTheDocument();
  });

  it('defaults to hidden even with a secret map (shoulder-surf safety)', () => {
    renderText(`use ${TOKEN}`, MAP);
    expect(document.body.textContent).not.toContain(REAL);
    expect(screen.getByLabelText(/Reveal AWS_KEY/)).toBeInTheDocument();
  });

  it('reveals and hides a value on toggle', () => {
    renderText(`use ${TOKEN}`, MAP);
    fireEvent.click(screen.getByLabelText(/Reveal AWS_KEY/));
    expect(document.body.textContent).toContain(REAL);
    fireEvent.click(screen.getByLabelText(/Hide AWS_KEY/));
    expect(document.body.textContent).not.toContain(REAL);
  });

  it('degrades gracefully when the map has no entry for the id (partial map)', () => {
    renderText(`use ${TOKEN}`, { other: { type: 'X', value: 'v' } });
    // Stays a placeholder, no reveal affordance, no error.
    expect(screen.getByText(/AWS_KEY/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reveal AWS_KEY/)).not.toBeInTheDocument();
  });

  it('renders a revealed value as inert text (not executable HTML)', () => {
    const xssMap: SecretMap = {
      s1: { type: 'AWS_KEY', value: '<img src=x onerror=alert(1)>' },
    };
    const { container } = renderText(`use ${TOKEN}`, xssMap);
    fireEvent.click(screen.getByLabelText(/Reveal AWS_KEY/));
    // The value renders as text; no <img> element is created from it.
    expect(within(container).queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
