import type { Session } from '@claudepad/schema';
import type { SecretMap } from './hooks/useReveal';
import { makeSecretToken } from './secret-token';

// A 1x1 transparent PNG (inline data is built from this base64 by ImageBlock).
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const AWS_TOKEN = makeSecretToken({ id: 's1', type: 'AWS_KEY', len: 20 });

/**
 * Representative demo session exercising every viewer feature: markdown,
 * fenced code, thinking, correlated tool success + error, an inline image, a
 * broken image, a raw/unknown block, a meta event, and a secret placeholder.
 */
export const demoSession: Session = {
  id: 'demo-session',
  source: 'claude-code',
  formatVersion: '2.1.177',
  meta: {
    title: 'Refactor the auth module',
    cwd: '~/projects/app',
    gitBranch: 'feat/auth-refactor',
    model: 'claude-opus-4-20250514',
    startedAt: '2026-06-18T14:02:00.000Z',
    endedAt: '2026-06-18T14:40:00.000Z',
    entrypoint: 'cli',
  },
  events: [
    {
      kind: 'user',
      id: 'u1',
      ts: '2026-06-18T14:02:00.000Z',
      content: [
        {
          type: 'text',
          text: [
            'Can you **refactor the auth module** to use the new token flow?',
            '',
            'A few constraints:',
            '- keep it backwards compatible',
            '- add tests',
            '',
            `Deploy uses key ${AWS_TOKEN} for the staging bucket.`,
          ].join('\n'),
        },
      ],
    },
    {
      kind: 'assistant',
      id: 'a1',
      ts: '2026-06-18T14:03:10.000Z',
      model: 'claude-opus-4-20250514',
      content: [
        {
          type: 'text',
          text: [
            "Sure — here's the plan:",
            '',
            '1. Read the current `auth.ts`',
            '2. Swap the legacy flow for `mintToken()`',
            '3. Add a regression test',
            '',
            '| step | file | status |',
            '| --- | --- | --- |',
            '| read | auth.ts | ✓ |',
            '| edit | auth.ts | pending |',
            '',
            'The new helper looks like:',
          ].join('\n'),
        },
        {
          type: 'code',
          lang: 'ts',
          text: [
            'export async function mintToken(user: User): Promise<Token> {',
            '  const claims = buildClaims(user);',
            '  return sign(claims, { expiresIn: "15m" });',
            '}',
          ].join('\n'),
        },
      ],
    },
    {
      kind: 'thinking',
      id: 'k1',
      ts: '2026-06-18T14:03:20.000Z',
      content: [
        {
          type: 'text',
          text: 'I should inspect the existing auth module before editing so I do not break the legacy callers. Let me read auth.ts first, then run the test suite to establish a baseline.',
        },
      ],
    },
    {
      kind: 'tool_use',
      id: 't1',
      toolId: 'toolu_read_1',
      ts: '2026-06-18T14:03:30.000Z',
      name: 'Read',
      input: { file_path: 'src/auth.ts' },
    },
    {
      kind: 'tool_result',
      id: 'r1',
      forToolId: 'toolu_read_1',
      forName: 'Read',
      ts: '2026-06-18T14:03:31.000Z',
      output:
        'export function legacyAuth(req) {\n  // ...80 lines...\n  return token;\n}',
      isError: false,
    },
    {
      kind: 'tool_use',
      id: 't2',
      toolId: 'toolu_bash_1',
      ts: '2026-06-18T14:04:00.000Z',
      name: 'Bash',
      input: { command: 'npm test', timeout: 120000 },
    },
    {
      kind: 'tool_result',
      id: 'r2',
      forToolId: 'toolu_bash_1',
      forName: 'Bash',
      ts: '2026-06-18T14:04:40.000Z',
      isError: true,
      output:
        'FAIL  src/auth.test.ts\n  ● auth › mints a token\n    expected 200, received 401\n    at Object.<anonymous> (src/auth.test.ts:42:5)',
    },
    {
      kind: 'assistant',
      id: 'a2',
      ts: '2026-06-18T14:05:00.000Z',
      model: 'claude-opus-4-20250514',
      content: [
        {
          type: 'text',
          text: 'The baseline test fails (401). Here is a screenshot of the failing run, then I will fix the claim builder.',
        },
        {
          type: 'image',
          ref: TINY_PNG_B64,
          mediaType: 'image/png',
          encoding: 'base64',
        },
        {
          type: 'image',
          ref: 'missing-attachment-xyz',
          mediaType: 'image/png',
          encoding: 'file',
        },
        {
          type: 'raw',
          value: {
            type: 'unknown_block',
            note: 'a future content type we do not model yet',
          },
        },
      ],
    },
    {
      kind: 'meta',
      id: 'm1',
      ts: '2026-06-18T14:05:20.000Z',
      note: 'Session compacted',
      subtype: 'compact',
      raw: { reason: 'context-limit', removed: 14 },
    },
    {
      kind: 'user',
      id: 'u2',
      ts: '2026-06-18T14:06:00.000Z',
      content: [{ type: 'text', text: 'Ship it once tests pass.' }],
    },
  ],
};

/** High-priv secret map matching the demo placeholder (for reveal demos/tests). */
export const demoSecretMap: SecretMap = {
  s1: { type: 'AWS_KEY', value: 'AKIAIOSFODNN7EXAMPLE' },
};
