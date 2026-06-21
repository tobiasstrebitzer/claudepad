import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Session, SessionEvent } from '@claudepad/schema';
import { correlateTools } from '../src/viewer/hooks/useCorrelateTools';
import { groupRows, baseToViewIndex } from '../src/viewer/hooks/groupRows';
import { SessionViewer } from '../src/viewer';

function session(events: SessionEvent[]): Session {
  return { id: 's', source: 'claude-code', formatVersion: 'test', meta: { title: 'T' }, events };
}

function reads(n: number): SessionEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'tool_use' as const,
    name: 'Read',
    input: { file_path: `/file-${i}.ts` },
  }));
}

describe('groupRows', () => {
  it('folds >= 3 consecutive tool calls', () => {
    const items = groupRows(correlateTools(reads(4)));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tool-run', baseStart: 0 });
    if (items[0]?.kind === 'tool-run') expect(items[0].rows).toHaveLength(4);
  });

  it('does not fold short runs (< 3)', () => {
    const items = groupRows(correlateTools(reads(2)));
    expect(items.every((it) => it.kind === 'single')).toBe(true);
    expect(items).toHaveLength(2);
  });

  it('folds mixed-name tool runs (broken only by a conversation turn)', () => {
    const items = groupRows(
      correlateTools([
        ...reads(3),
        { kind: 'user', content: [{ type: 'text', text: 'hi' }] },
        ...reads(3),
        { kind: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    // run | user | mixed run (3 Read + 1 Bash)
    expect(items.map((it) => it.kind)).toEqual(['tool-run', 'single', 'tool-run']);
  });

  it('maps every base-row position to its containing view item', () => {
    const items = groupRows(
      correlateTools([
        { kind: 'user', content: [{ type: 'text', text: 'hi' }] },
        ...reads(3),
      ]),
    );
    // base 0 = user (item 0), base 1..3 = the fold (item 1)
    expect(baseToViewIndex(items)).toEqual([0, 1, 1, 1]);
  });

  it('inserts an idle divider for a long real-time gap', () => {
    const items = groupRows(
      correlateTools([
        { kind: 'user', content: [{ type: 'text', text: 'a' }], ts: '2026-01-01T00:00:00.000Z' },
        { kind: 'user', content: [{ type: 'text', text: 'b' }], ts: '2026-01-01T00:30:00.000Z' },
      ]),
      { idleMs: 5 * 60_000 },
    );
    expect(items.map((it) => it.kind)).toEqual(['single', 'idle', 'single']);
  });
});

describe('tool-run rendering', () => {
  it('collapses a run in the reading view and expands on click', () => {
    render(
      <SessionViewer session={session(reads(4))} options={{ virtualize: false, showToc: false }} />,
    );
    // Folded: count shown, individual file paths hidden.
    expect(screen.getByText('×4')).toBeInTheDocument();
    expect(screen.queryByText('/file-0.ts')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Read'));
    expect(screen.getByText('/file-0.ts')).toBeInTheDocument();
    expect(screen.getByText('/file-3.ts')).toBeInTheDocument();
  });
});
