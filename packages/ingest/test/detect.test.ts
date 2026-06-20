import { describe, it, expect } from 'vitest';
import { classify, isIngestible } from '../src/detect';

const obj = '{"type":"user","message":{"role":"user","content":"hi"},"uuid":"a"}';
const obj2 =
  '{"type":"assistant","message":{"role":"assistant","content":"yo"},"uuid":"b"}';

describe('classify (PRD-04 FR-6)', () => {
  it('classifies a single JSON object', () => {
    expect(classify(obj)).toBe('json-object');
  });

  it('classifies a JSON array', () => {
    expect(classify(`[${obj},${obj2}]`)).toBe('json-array');
  });

  it('classifies NDJSON / multi-line .jsonl text', () => {
    expect(classify(`${obj}\n${obj2}`)).toBe('jsonl');
    expect(classify(`${obj}\r\n${obj2}\r\n`)).toBe('jsonl');
  });

  it('tolerates blank lines and a truncated final line in jsonl', () => {
    expect(classify(`${obj}\n\n${obj2}\n{"type":"user"`)).toBe('jsonl');
  });

  it('strips a leading BOM', () => {
    expect(classify(`\uFEFF${obj}`)).toBe('json-object');
  });

  it('rejects prose, empty, and whitespace as unknown', () => {
    expect(classify('just some notes I copied')).toBe('unknown');
    expect(classify('')).toBe('unknown');
    expect(classify('   \n  \t ')).toBe('unknown');
  });

  it('rejects a bare JSON string/number (not a session shape)', () => {
    expect(classify('"hello"')).toBe('unknown');
    expect(classify('42')).toBe('unknown');
  });

  it('isIngestible mirrors classify != unknown', () => {
    expect(isIngestible(obj)).toBe(true);
    expect(isIngestible('nope')).toBe(false);
  });
});
