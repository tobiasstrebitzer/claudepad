// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractSessionMeta, cleanTitleText } from '@/ingest/session-meta';

// Record shapes mirror real ~/.claude session files (the trailing meta block that
// Claude Code appends per turn): ai-title, last-prompt, plus cwd/gitBranch on
// message lines.
const userLine = (content: string) =>
  JSON.stringify({ type: 'user', message: { role: 'user', content }, cwd: '/Users/me/app', gitBranch: 'master' });
const aiTitleLine = (aiTitle: string) =>
  JSON.stringify({ type: 'ai-title', aiTitle, sessionId: 's1' });
const lastPromptLine = (lastPrompt: string) =>
  JSON.stringify({ type: 'last-prompt', lastPrompt, leafUuid: 'x' });

describe('extractSessionMeta (PRD-04)', () => {
  it('prefers the ai-title and reads branch + cwd', () => {
    const text = [
      userLine('please refactor the thing'),
      aiTitleLine('Refactor NestJS integration with OpenAPI-driven MCP'),
      lastPromptLine('/dev:wrapup ship it'),
    ].join('\n');
    const meta = extractSessionMeta(text);
    expect(meta.title).toBe('Refactor NestJS integration with OpenAPI-driven MCP');
    expect(meta.aiTitle).toBe('Refactor NestJS integration with OpenAPI-driven MCP');
    expect(meta.gitBranch).toBe('master');
    expect(meta.cwd).toBe('/Users/me/app');
  });

  it('takes the LAST ai-title when several are present', () => {
    const text = [aiTitleLine('Old title'), aiTitleLine('New title')].join('\n');
    expect(extractSessionMeta(text).title).toBe('New title');
  });

  it('falls back to a slash command when there is no ai-title', () => {
    // The first user message is a local-command caveat (no signal); the real one
    // carries a <command-name> tag - exactly the untitled /mcp session case.
    const caveat = userLine('<local-command-caveat>Caveat: ...</local-command-caveat>');
    const cmd = userLine('<command-name>/mcp</command-name><command-message>mcp</command-message>');
    const meta = extractSessionMeta([caveat, cmd].join('\n'));
    expect(meta.title).toBe('/mcp');
    expect(meta.aiTitle).toBeUndefined();
  });

  it('falls back to the last prompt before the first user line', () => {
    const text = [userLine('boring first message'), lastPromptLine('Fix the flaky test')].join('\n');
    // ai-title absent → last-prompt wins over first-user (more recent intent).
    expect(extractSessionMeta(text).title).toBe('Fix the flaky test');
  });

  it('is tolerant of blank and non-JSON lines', () => {
    const text = ['', 'not json', aiTitleLine('Solid title'), '   '].join('\n');
    expect(extractSessionMeta(text).title).toBe('Solid title');
  });

  it('returns an empty-ish object for content-free input', () => {
    expect(extractSessionMeta('')).toEqual({ title: undefined, aiTitle: undefined, gitBranch: undefined, cwd: undefined });
  });
});

describe('cleanTitleText', () => {
  it('surfaces a slash command verbatim', () => {
    expect(cleanTitleText('<command-name>/resume</command-name>')).toBe('/resume');
  });
  it('strips wrapper tags and collapses whitespace', () => {
    expect(cleanTitleText('<x>hello</x>   world')).toBe('hello world');
  });
  it('truncates very long text', () => {
    const long = 'a'.repeat(200);
    const out = cleanTitleText(long)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(91);
  });
  it('returns undefined when nothing remains', () => {
    expect(cleanTitleText('<only></only>')).toBeUndefined();
    expect(cleanTitleText('')).toBeUndefined();
  });
});
