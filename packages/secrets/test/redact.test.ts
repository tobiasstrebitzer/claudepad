import { describe, it, expect } from 'vitest';
import type { Session } from '@claudepad/schema';
import { scanSession, redact, findLeakedValues, DEFAULT_SCAN_SETTINGS } from '../src/index';

const AWS = 'AKIAIOSFODNN7EXAMPLE';
const ENV_VALUE = 'hunter2-very-secret-value';

function richSession(): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: {},
    events: [
      { kind: 'user', id: 'u1', content: [{ type: 'text', text: `deploy with ${AWS}` }] },
      {
        kind: 'assistant',
        id: 'a1',
        content: [{ type: 'code', lang: 'sh', text: `export KEY=${AWS}\necho ${ENV_VALUE}` }],
      },
      {
        kind: 'tool_use',
        id: 't1',
        name: 'Bash',
        input: { command: `aws --key ${AWS}`, nested: { token: ENV_VALUE } },
      },
      { kind: 'tool_result', id: 'r1', output: `used ${AWS} ok` },
    ],
  };
}

describe('redaction (PRD-06 §7.5)', () => {
  it('hard gate (FR-25/AC-7): no confirmed value survives anywhere in the body', () => {
    const session = richSession();
    const detections = scanSession(session, { ...DEFAULT_SCAN_SETTINGS, envBlobs: [`X=${ENV_VALUE}`] });
    const { body, secretMap } = redact(session, detections);
    expect(findLeakedValues(body, secretMap)).toEqual([]);
    // Belt and suspenders: the raw values are gone from the serialized body.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(AWS);
    expect(serialized).not.toContain(ENV_VALUE);
  });

  it('redacts across text, code, tool input, and tool output (FR-1)', () => {
    const session = richSession();
    const detections = scanSession(session, { ...DEFAULT_SCAN_SETTINGS, envBlobs: [`X=${ENV_VALUE}`] });
    const { body } = redact(session, detections);
    const s = JSON.stringify(body);
    // Every location now carries a token instead of the value.
    expect(s).toContain('cp-secret:');
    expect(s.match(/cp-secret:/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it('placeholder is opaque: never a hash/prefix/substring of the value (FR-21)', () => {
    const session = richSession();
    const detections = scanSession(session);
    const { body, secretMap } = redact(session, detections);
    const serialized = JSON.stringify(body);
    // The id is random; the token must not embed the value or a prefix of it.
    for (const [id, entry] of Object.entries(secretMap)) {
      expect(serialized).toContain(`cp-secret:${id}:${entry.type}:${entry.len}`);
      expect(id).not.toContain(entry.value.slice(0, 4));
    }
  });

  it('dismissed detections stay as plaintext in the body (FR-24)', () => {
    const session = richSession();
    const detections = scanSession(session).map((d) => ({ ...d, state: 'dismissed' as const }));
    const { body, secretMap } = redact(session, detections);
    expect(secretMap).toEqual({});
    expect(JSON.stringify(body)).toContain(AWS);
  });

  it('preserves structure for non-secret content (FR-26)', () => {
    const session = richSession();
    const detections = scanSession(session);
    const { body } = redact(session, detections);
    expect(body.events).toHaveLength(session.events.length);
    expect(body.events[0]!.kind).toBe('user');
  });
});
