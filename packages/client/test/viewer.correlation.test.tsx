import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Session, SessionEvent } from '@claudepad/schema';
import { correlateTools } from '../src/viewer/hooks/useCorrelateTools';
import { SessionViewer } from '../src/viewer';

function session(events: SessionEvent[]): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: { title: 'T' },
    events,
  };
}

describe('correlateTools', () => {
  it('nests a tool_result under its tool_use via forToolId↔toolId', () => {
    const rows = correlateTools([
      { kind: 'tool_use', toolId: 'abc', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool_result', forToolId: 'abc', output: 'ok' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('tool');
    if (rows[0]?.kind === 'tool') {
      expect(rows[0].result?.output).toBe('ok');
    }
  });

  it('renders an uncorrelated result standalone', () => {
    const rows = correlateTools([
      { kind: 'tool_result', forToolId: 'no-match', output: 'orphan' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('orphan-result');
  });

  it('falls back to forName for a result lacking forToolId', () => {
    const rows = correlateTools([
      { kind: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
      { kind: 'tool_result', forName: 'Read', output: 'contents' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('tool');
  });

  it('does not double-fill a tool_use already matched', () => {
    const rows = correlateTools([
      { kind: 'tool_use', toolId: 'x', name: 'Bash', input: {} },
      { kind: 'tool_result', forToolId: 'x', output: 'first' },
      { kind: 'tool_result', forToolId: 'x', output: 'second' },
    ]);
    // first nests, second has no unfilled match -> standalone
    expect(rows).toHaveLength(2);
    expect(rows[1]?.kind).toBe('orphan-result');
  });
});

describe('error result auto-expand', () => {
  it('auto-expands an error result so the failure body is visible', () => {
    render(
      <SessionViewer
        session={session([
          { kind: 'tool_use', toolId: 't', name: 'Bash', input: { command: 'npm test' } },
          {
            kind: 'tool_result',
            forToolId: 't',
            isError: true,
            output: 'UNIQUE_ERROR_MARKER expected 200 received 401',
          },
        ])}
        options={{ virtualize: false, showToc: false }}
      />,
    );
    // Body text present (auto-expanded) without any user interaction.
    expect(screen.getByText(/UNIQUE_ERROR_MARKER/)).toBeInTheDocument();
  });

  it('keeps a success result collapsed by default (body not rendered)', () => {
    render(
      <SessionViewer
        session={session([
          { kind: 'tool_use', toolId: 't', name: 'Bash', input: { command: 'ls' } },
          { kind: 'tool_result', forToolId: 't', output: 'SUCCESS_BODY_MARKER' },
        ])}
        options={{ virtualize: false, showToc: false }}
      />,
    );
    expect(screen.queryByText(/SUCCESS_BODY_MARKER/)).not.toBeInTheDocument();
  });
});
