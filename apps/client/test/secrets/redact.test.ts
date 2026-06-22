// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Session } from '@/schema';
import { scanSession, redact, findLeakedValues, DEFAULT_SCAN_SETTINGS } from '@/secrets';

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

  // Regression: a confirmed value detected in scannable content but ALSO present
  // in a location the scanner skips (each event's preserved `raw` source record,
  // meta.raw, a raw content block, a meta-event note) used to survive redaction -
  // the redactor only walked the scannable subset while the body that ships (and
  // the FR-25 gate) serialize the whole session. That is a real leak, not just a
  // strict gate: `raw` is encrypted and handed to the recipient.
  it('hard gate covers raw/meta locations the scanner skips (FR-25 regression)', () => {
    const session: Session = {
      id: 's',
      source: 'claude-code',
      formatVersion: 'test',
      // The same secret lifted into session-level preserved metadata.
      meta: { raw: { firstLine: `connect with ${AWS}` } },
      events: [
        {
          kind: 'tool_result',
          id: 'r1',
          output: `start-time failure: ${AWS}`,
          // The original source record duplicates the value verbatim (preserveRaw).
          raw: { type: 'tool_result', content: `start-time failure: ${AWS}`, extra: AWS },
        },
        {
          kind: 'user',
          id: 'u1',
          content: [{ type: 'raw', value: { pastedText: `key ${AWS}` } }],
          raw: { message: { content: `key ${AWS}` } },
        },
        { kind: 'meta', id: 'm1', note: `saw ${AWS} in env`, raw: { line: AWS } },
      ],
    };

    const detections = scanSession(session);
    // The value is detected from the scannable tool_result output...
    expect(detections.some((d) => d.value === AWS)).toBe(true);

    const { body, secretMap } = redact(session, detections);
    // ...and must be scrubbed everywhere, including the skipped raw/meta locations.
    expect(findLeakedValues(body, secretMap)).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(AWS);
    // Structure (and the meta-event note) is preserved, just tokenized.
    expect(body.events).toHaveLength(3);
    expect(JSON.stringify(body)).toContain('cp-secret:');
  });
});
