import { describe, it, expect } from 'vitest';
import type { SessionEvent } from '@claudepad/schema';
import { correlateTools } from '../src/viewer/hooks/useCorrelateTools';
import {
  rowGroup,
  filterRows,
  DEFAULT_VISIBILITY,
  type EventGroup,
} from '../src/viewer/hooks/eventFilter';

function group1(event: SessionEvent): EventGroup {
  return rowGroup(correlateTools([event])[0]!);
}

describe('rowGroup classification', () => {
  it('splits Bash from other tools', () => {
    expect(group1({ kind: 'tool_use', name: 'Bash', input: { command: 'ls' } })).toBe('bash');
    expect(group1({ kind: 'tool_use', name: 'Read', input: { file_path: 'a' } })).toBe('tools');
  });

  it('routes slash commands to commands, conversation to messages', () => {
    expect(
      group1({ kind: 'user', content: [{ type: 'text', text: '<command-name>/x</command-name>' }] }),
    ).toBe('commands');
    expect(group1({ kind: 'user', content: [{ type: 'text', text: 'hello' }] })).toBe('messages');
    expect(group1({ kind: 'assistant', content: [{ type: 'text', text: 'hi' }] })).toBe('messages');
    expect(group1({ kind: 'thinking', content: [{ type: 'text', text: 'hmm' }] })).toBe('messages');
  });

  it('routes meta + injected/system user turns to system', () => {
    expect(group1({ kind: 'meta', note: 'system:local_command', subtype: 'local_command' })).toBe(
      'system',
    );
    expect(group1({ kind: 'meta', note: 'system:away_summary', subtype: 'away_summary' })).toBe(
      'system',
    );
    expect(group1({ kind: 'user', meta: true, content: [{ type: 'text', text: 'x' }] })).toBe(
      'system',
    );
    expect(
      group1({
        kind: 'user',
        content: [{ type: 'text', text: '<system-reminder>be careful</system-reminder>' }],
      }),
    ).toBe('system');
  });
});

describe('filterRows', () => {
  const rows = correlateTools([
    { kind: 'user', content: [{ type: 'text', text: 'hi' }] },
    { kind: 'tool_use', name: 'Read', input: {} },
    { kind: 'tool_use', name: 'Bash', input: { command: 'ls' } },
    { kind: 'meta', note: 'system:local_command', subtype: 'local_command' },
  ]);

  it('drops the System group by default, keeps the rest', () => {
    const out = filterRows(rows, DEFAULT_VISIBILITY);
    expect(out.map(rowGroup)).toEqual(['messages', 'tools', 'bash']);
  });

  it('can drop Bash while keeping other tools', () => {
    const out = filterRows(rows, { ...DEFAULT_VISIBILITY, bash: false });
    expect(out.map(rowGroup)).toEqual(['messages', 'tools']);
  });
});
