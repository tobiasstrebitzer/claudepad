import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSession, SCHEMA_VERSION } from '../src/index';
import type { ParseResult } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

function assertWellFormed(res: ParseResult): void {
  expect(res).toBeDefined();
  expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  expect(res.session).toBeDefined();
  expect(Array.isArray(res.session.events)).toBe(true);
  expect(Array.isArray(res.diagnostics)).toBe(true);
  expect(res.stats).toBeDefined();
  // Fidelity invariant must hold for ANY input (§6.3, FR-24).
  expect(res.stats.mappedRecords + res.stats.droppedToDiagnostics).toBe(
    res.stats.parsedRecords,
  );
  // Every ts is valid ISO-8601 UTC or undefined — never "Invalid Date" (FR-26).
  for (const e of res.session.events) {
    if (e.ts !== undefined) {
      expect(Number.isNaN(Date.parse(e.ts))).toBe(false);
      expect(new Date(e.ts).toISOString()).toBe(e.ts);
    }
  }
}

const validLine = readFileSync(join(fixturesDir, 'real-2.1.177.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0);

describe('property: parseSession NEVER throws and always returns a ParseResult (FR-24, §6.3)', () => {
  it('survives arbitrary unicode strings', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (s) => {
        const res = await parseSession(s);
        assertWellFormed(res);
      }),
      { numRuns: 300 },
    );
  });

  it('survives arbitrary raw bytes (ArrayBuffer)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array(), async (bytes) => {
        const buf = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const res = await parseSession(buf);
        assertWellFormed(res);
      }),
      { numRuns: 300 },
    );
  });

  it('survives mutated/shuffled/truncated valid JSONL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.nat(validLine.length - 1), { maxLength: 30 }),
        fc.boolean(),
        fc.string({ maxLength: 8 }),
        async (indices, truncate, garbage) => {
          const lines = indices.map((i) => validLine[i] ?? '');
          if (truncate && lines.length > 0) {
            // Truncate the final line mid-JSON (FR-2).
            const last = lines[lines.length - 1] ?? '';
            lines[lines.length - 1] = last.slice(0, Math.floor(last.length / 2));
          }
          // Inject garbage somewhere.
          lines.push(garbage);
          const input = lines.join('\n');
          const res = await parseSession(input);
          assertWellFormed(res);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('survives JSON values mutated with extra/unknown fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.oneof(
              fc.constant('user'),
              fc.constant('assistant'),
              fc.constant('system'),
              fc.constant('ai-title'),
              fc.string(),
            ),
            uuid: fc.option(fc.string(), { nil: undefined }),
            parentUuid: fc.option(fc.string(), { nil: null }),
            timestamp: fc.oneof(
              fc.constant('2026-06-13T11:00:35.997Z'),
              fc.constant('not-a-date'),
              fc.integer(),
            ),
            message: fc.option(
              fc.record({
                role: fc.string(),
                content: fc.oneof(fc.string(), fc.array(fc.object())),
              }),
              { nil: undefined },
            ),
            version: fc.constant('2.1.177'),
          }),
          { maxLength: 20 },
        ),
        async (records) => {
          const input = records.map((r) => JSON.stringify(r)).join('\n');
          const res = await parseSession(input);
          assertWellFormed(res);
        },
      ),
      { numRuns: 300 },
    );
  });
});
