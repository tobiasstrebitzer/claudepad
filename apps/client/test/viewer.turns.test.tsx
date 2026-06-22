import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Session, SessionEvent } from '@/schema';
import { correlateTools } from '../src/viewer/hooks/useCorrelateTools';
import { isHiddenEvent, attachmentType } from '../src/viewer/hooks/eventVisibility';
import { matchTurn } from '../src/viewer/components/turns/registry';
import { SessionViewer, EventFilterProvider, DEFAULT_VISIBILITY } from '../src/viewer';

function session(events: SessionEvent[]): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: { title: 'T' },
    events,
  };
}

beforeEach(() => localStorage.clear());

/** Render the viewer inside the event-filter provider; optionally show System. */
function renderViewer(events: SessionEvent[], opts?: { system?: boolean }) {
  if (opts?.system) {
    localStorage.setItem(
      'claudepad.eventFilter',
      JSON.stringify({ ...DEFAULT_VISIBILITY, system: true }),
    );
  }
  return render(
    <EventFilterProvider>
      <SessionViewer session={session(events)} options={{ virtualize: false, showToc: false }} />
    </EventFilterProvider>,
  );
}

const slashUser: SessionEvent = {
  kind: 'user',
  content: [
    {
      type: 'text',
      text: '<command-name>/plugin</command-name>\n<command-args>marketplace add foo</command-args>',
    },
  ],
};

const localCommand: SessionEvent = {
  kind: 'meta',
  note: 'system:local_command',
  subtype: 'local_command',
  raw: { type: 'system', subtype: 'local_command', content: '<local-command-stdout>HELLO_STDOUT</local-command-stdout>' },
};

describe('eventVisibility.isHiddenEvent', () => {
  it('hides pure session-metadata + telemetry', () => {
    const cases: Array<[string, string]> = [
      ['ai-title', 'ai-title'],
      ['mode', 'mode'],
      ['file-history-snapshot', 'file-history-snapshot'],
      ['turn_duration', 'system:turn_duration'],
    ];
    for (const [subtype, note] of cases) {
      expect(isHiddenEvent({ kind: 'meta', note, subtype })).toBe(true);
    }
  });

  it('hides chatter attachments by attachment.type', () => {
    const ev: SessionEvent = {
      kind: 'meta',
      note: 'attachment',
      subtype: 'attachment',
      raw: { type: 'attachment', attachment: { type: 'task_reminder' } },
    };
    expect(attachmentType(ev)).toBe('task_reminder');
    expect(isHiddenEvent(ev)).toBe(true);
  });

  it('keeps conversation + meaningful events', () => {
    expect(isHiddenEvent(slashUser)).toBe(false);
    expect(isHiddenEvent(localCommand)).toBe(false);
    expect(isHiddenEvent({ kind: 'assistant', content: [] })).toBe(false);
    expect(
      isHiddenEvent({ kind: 'meta', note: 'system:away_summary', subtype: 'away_summary' }),
    ).toBe(false);
  });
});

describe('correlateTools drops hidden events', () => {
  it('filters telemetry rows so viewer + playback stay in lockstep', () => {
    const rows = correlateTools([
      { kind: 'meta', note: 'mode', subtype: 'mode' },
      { kind: 'user', content: [{ type: 'text', text: 'hi' }] },
      { kind: 'meta', note: 'system:turn_duration', subtype: 'turn_duration' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event.kind).toBe('user');
  });
});

describe('matchTurn routing', () => {
  it('routes slash commands, task tools, and local-command output to custom turns', () => {
    expect(matchTurn(correlateTools([slashUser])[0]!).id).toBe('slash-command');
    expect(
      matchTurn(
        correlateTools([{ kind: 'tool_use', name: 'TodoWrite', input: { todos: [] } }])[0]!,
      ).id,
    ).toBe('task-list');
    expect(matchTurn(correlateTools([localCommand])[0]!).id).toBe('local-command');
  });

  it('falls back to generic tool / user / meta matchers', () => {
    expect(
      matchTurn(correlateTools([{ kind: 'tool_use', name: 'Bash', input: {} }])[0]!).id,
    ).toBe('tool');
    expect(
      matchTurn(correlateTools([{ kind: 'user', content: [{ type: 'text', text: 'hi' }] }])[0]!)
        .id,
    ).toBe('user');
    expect(
      matchTurn(correlateTools([{ kind: 'meta', note: 'system:away_summary', subtype: 'away_summary' }])[0]!)
        .id,
    ).toBe('meta');
  });
});

describe('custom turn rendering', () => {
  it('renders a slash command as a chip, not raw XML', () => {
    renderViewer([slashUser]);
    expect(screen.getByText('/plugin')).toBeInTheDocument();
    expect(screen.getByText(/marketplace add foo/)).toBeInTheDocument();
    expect(screen.queryByText(/command-name/)).not.toBeInTheDocument();
  });

  it('renders TodoWrite as a checklist', () => {
    renderViewer([
      {
        kind: 'tool_use',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'FIRST_TASK', status: 'completed' },
            { content: 'SECOND_TASK', status: 'in_progress' },
          ],
        },
      },
    ]);
    expect(screen.getByText('FIRST_TASK')).toBeInTheDocument();
    expect(screen.getByText('SECOND_TASK')).toBeInTheDocument();
  });

  it('hides local-command output by default (System group off)', () => {
    renderViewer([localCommand]);
    expect(screen.queryByText(/HELLO_STDOUT/)).not.toBeInTheDocument();
  });

  it('renders local-command stdout when System is enabled', () => {
    renderViewer([localCommand], { system: true });
    expect(screen.getByText(/HELLO_STDOUT/)).toBeInTheDocument();
  });

  it('renders AskUserQuestion as a question + options card', () => {
    renderViewer([
      {
        kind: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              header: 'Auth',
              question: 'PICK_AUTH_METHOD?',
              options: [{ label: 'OPTION_OAUTH' }, { label: 'OPTION_APIKEY' }],
            },
          ],
        },
      },
    ]);
    expect(screen.getByText('PICK_AUTH_METHOD?')).toBeInTheDocument();
    expect(screen.getByText('OPTION_OAUTH')).toBeInTheDocument();
    expect(screen.getByText('OPTION_APIKEY')).toBeInTheDocument();
  });
});
