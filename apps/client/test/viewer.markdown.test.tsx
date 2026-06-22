import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '../src/viewer/components/blocks/Markdown';

describe('Markdown sanitization (FR-3, §8)', () => {
  it('does NOT render raw HTML / executable img onerror from session text', () => {
    const { container } = render(
      <Markdown text={'before <img src=x onerror="alert(1)"> after'} />,
    );
    // rehype-sanitize strips the raw <img>; no image element is produced.
    expect(container.querySelector('img')).toBeNull();
    // No <script> either.
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders GFM tables and task lists', () => {
    render(
      <Markdown text={'| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo'} />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);
  });

  it('renders inline code and links sanitized', () => {
    const { container } = render(
      <Markdown text={'use `npm test` and [link](https://example.com)'} />,
    );
    expect(container.querySelector('code')?.textContent).toContain('npm test');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('does not render a javascript: link href', () => {
    const { container } = render(<Markdown text={'[x](javascript:alert(1))'} />);
    const href = container.querySelector('a')?.getAttribute('href') ?? '';
    expect(href.startsWith('javascript:')).toBe(false);
  });
});
