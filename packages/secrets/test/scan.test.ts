import { describe, it, expect } from 'vitest';
import type { Session } from '@claudepad/schema';
import {
  scanSession,
  DEFAULT_SCAN_SETTINGS,
  shannonEntropy,
  parseEnv,
} from '../src/index';

function sessionWith(text: string): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: {},
    events: [{ kind: 'user', id: 'u1', content: [{ type: 'text', text }] }],
  };
}

describe('prefix detection (FR-2a, 100% recall on known shapes - AC-10)', () => {
  const cases: [string, string, string][] = [
    ['OPENAI_KEY', 'sk-proj-abcDEF0123456789ghijklmnop', 'sk-proj-abcDEF0123456789ghijklmnop'],
    ['GH_TOKEN', 'ghp_0123456789abcdefABCDEF0123456789abcd', 'ghp_0123456789abcdefABCDEF0123456789abcd'],
    ['AWS_KEY', 'AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
    ['GOOGLE_API_KEY', 'AIzaSyA0123456789abcdefghijklmnopqrstuv', 'AIzaSyA0123456789abcdefghijklmnopqrstuv'],
    ['STRIPE_KEY', 'sk_live_0123456789abcdefABCDEF', 'sk_live_0123456789abcdefABCDEF'],
  ];

  for (const [type, token, expected] of cases) {
    it(`detects ${type}`, () => {
      const found = scanSession(sessionWith(`here is a key: ${token} end`));
      const hit = found.find((d) => d.value === expected);
      expect(hit, `expected to detect ${type}`).toBeTruthy();
      expect(hit!.type).toBe(type);
      expect(hit!.signals).toContain('prefix');
      expect(hit!.state).toBe('redact');
    });
  }

  it('detects a JWT and a PEM private key block', () => {
    const jwt = 'eyJhbGciOiJIUzI1Ni00.eyJzdWIiOiIxMjM0NTY00.SflKxwRJSMeKKF2QT4';
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\n-----END PRIVATE KEY-----';
    const found = scanSession(sessionWith(`${jwt}\n${pem}`));
    expect(found.some((d) => d.type === 'JWT')).toBe(true);
    expect(found.some((d) => d.type === 'PEM_PRIVATE_KEY')).toBe(true);
  });

  it('extracts only the password from a connection string (OQ-A)', () => {
    const found = scanSession(sessionWith('postgres://user:s3cr3t_p4ss@db.host:5432/app'));
    const hit = found.find((d) => d.type === 'CONNECTION_STRING');
    expect(hit?.value).toBe('s3cr3t_p4ss');
  });
});

describe('entropy detection + suppressors (FR-4, FR-5, AC-2)', () => {
  it('flags a high-entropy token', () => {
    const found = scanSession(sessionWith('token=Xa9Kd7Lm2Qp4Rt6Vy8Zb1Nc3Wf5Hj0Gs'));
    expect(found.some((d) => d.signals.includes('entropy'))).toBe(true);
  });

  it('down-ranks a git SHA and a UUID (suppressed, pre-dismissed)', () => {
    const sha = 'a'.repeat(40);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const found = scanSession(sessionWith(`commit ${sha} id ${uuid}`));
    const shaHit = found.find((d) => d.value === sha);
    const uuidHit = found.find((d) => d.value === uuid);
    for (const hit of [shaHit, uuidHit]) {
      if (hit) {
        expect(hit.suppressedReason).toBeTruthy();
        expect(hit.state).toBe('dismissed');
      }
    }
  });

  it('sensitivity raises recall', () => {
    const text = sessionWith('val=Ab12Cd34Ef56Gh78Ij90');
    const strict = scanSession(text, { ...DEFAULT_SCAN_SETTINGS, entropySensitivity: 0 });
    const loose = scanSession(text, { ...DEFAULT_SCAN_SETTINGS, entropySensitivity: 1 });
    expect(loose.length).toBeGreaterThanOrEqual(strict.length);
  });
});

describe('.env exact match (FR-6, FR-7)', () => {
  it('matches a pasted value by KEY and skips trivial values', () => {
    const env = 'export DB_PASS="hunter2-very-secret"\nPORT=3000\nDEBUG=true';
    const found = scanSession(sessionWith('config: hunter2-very-secret on port 3000'), {
      ...DEFAULT_SCAN_SETTINGS,
      envBlobs: [env],
    });
    const hit = found.find((d) => d.value === 'hunter2-very-secret');
    expect(hit?.type).toBe('ENV:DB_PASS');
    expect(hit?.signals).toContain('env-exact');
    // PORT=3000 is trivial (integer) → not redacted as a secret.
    expect(found.some((d) => d.value === '3000')).toBe(false);
  });
});

describe('utilities', () => {
  it('shannonEntropy is higher for random than repeated', () => {
    expect(shannonEntropy('aaaaaaaa')).toBeLessThan(shannonEntropy('a8Kd7Lm2'));
  });
  it('parseEnv handles quotes, export, and comments', () => {
    const parsed = parseEnv("# c\nexport A='x y'\nB=plain # trailing\nBAD");
    expect(parsed).toEqual([
      { key: 'A', value: 'x y' },
      { key: 'B', value: 'plain' },
    ]);
  });
});
