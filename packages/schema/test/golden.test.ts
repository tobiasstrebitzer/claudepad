import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSession } from '../src/index';
import type { SessionEvent } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

interface Golden {
  version: string;
  expectedEventCount: number;
  kindHistogram: Record<string, number>;
}

function histogram(events: SessionEvent[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const e of events) h[e.kind] = (h[e.kind] ?? 0) + 1;
  return h;
}

const realFixtures = readdirSync(fixturesDir).filter(
  (f) => f.startsWith('real-') && f.endsWith('.jsonl'),
);

describe('golden snapshots — redacted real sessions (FR-7, FR-8, FR-10..FR-20)', () => {
  it('has at least three real fixtures spanning multiple versions', () => {
    expect(realFixtures.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of realFixtures) {
    it(`matches the golden snapshot for ${file}`, async () => {
      const text = readFileSync(join(fixturesDir, file), 'utf8');
      const golden: Golden = JSON.parse(
        readFileSync(join(fixturesDir, file.replace('.jsonl', '.meta.json')), 'utf8'),
      );

      const result = await parseSession(text);

      // Version detection (FR-8).
      expect(result.session.formatVersion).toBe(golden.version);
      // Event count + kind histogram (golden snapshot).
      expect(result.session.events.length).toBe(golden.expectedEventCount);
      expect(histogram(result.session.events)).toEqual(golden.kindHistogram);

      // Fidelity invariant on every real fixture (FR + §10).
      expect(result.stats.mappedRecords + result.stats.droppedToDiagnostics).toBe(
        result.stats.parsedRecords,
      );

      // Source detected structurally (FR-7).
      expect(result.session.source).toBe('claude-code');

      // Lifted meta: startedAt present + valid ISO when any record has a ts (FR-27).
      if (result.session.meta.startedAt !== undefined) {
        expect(new Date(result.session.meta.startedAt).toISOString()).toBe(
          result.session.meta.startedAt,
        );
      }
    });
  }

  it('lifts ai-title into session meta (FR-20)', async () => {
    const text = readFileSync(join(fixturesDir, 'real-2.1.177.jsonl'), 'utf8');
    const result = await parseSession(text);
    expect(result.session.meta.title).toBe('Fix Google OAuth redirect URI configuration');
    expect(result.session.meta.cwd).toBeDefined();
    expect(result.session.meta.model).toBeDefined();
  });

  it('determines order deterministically across repeated parses', async () => {
    const text = readFileSync(join(fixturesDir, 'real-2.1.177.jsonl'), 'utf8');
    const a = await parseSession(text);
    const b = await parseSession(text);
    expect(a.session.events.map((e) => e.id)).toEqual(b.session.events.map((e) => e.id));
  });
});
