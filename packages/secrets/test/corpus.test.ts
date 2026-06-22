// Labeled ground-truth corpus for detection recall/precision (PRD-06 AC-10).
// Every value here is FAKE (canonical AWS example key, dummy tokens) - no real
// secret is committed. Secrets must be caught (state 'redact'); decoys must not
// be redacted (either not flagged, or down-ranked to 'dismissed' by a
// suppressor). Recall is the hard gate (>= 0.95); precision is documented and
// includes known false positives (unstructured high-entropy blobs) that the
// review UI surfaces for one-click dismissal - honesty over polish.

import { describe, it, expect } from 'vitest';
import type { Session } from '@claudepad/schema';
import { scanSession, DEFAULT_SCAN_SETTINGS } from '../src/index';
import { DETECTION_QUALITY } from '../src/quality';

interface Labeled {
  /** A short note for failure messages. */
  label: string;
  /** The text that appears in the session (the secret embedded in context). */
  text: string;
  /** The exact value we expect to be redacted. */
  value: string;
}

// .env blob pasted alongside (exercises the exact-match detector, FR-6). The
// `whsec` value is split with `+` to match `tok.stripeWebhook` below without the
// contiguous vendor pattern appearing in source (see the note on `tok`).
const ENV_BLOB = [
  'export DB_PASSWORD="s3cr3t-db-p4ssw0rd-x9"',
  'STRIPE_WEBHOOK_SECRET=' + 'whsec' + '_abc123def456ghi789jkl012',
].join('\n');

// These tokens are split with `+` so the contiguous vendor pattern never appears
// in source - GitHub push-protection / secret scanners flag fake-but-realistic
// fixtures otherwise. The runtime value is whole, so detection is exercised for
// real. (AWS uses the canonical public EXAMPLE key, which scanners allowlist.)
const tok = {
  openai: 'sk-' + 'proj-abcDEF0123456789ghijklmnop',
  openaiLegacy: 'sk-' + 'abcDEF0123456789ghijklmnopqrstuv',
  anthropic: 'sk-' + 'ant-api03-AbCdEf0123456789GhIjKlMnOp',
  ghPat: 'ghp' + '_0123456789abcdefABCDEF0123456789abcd',
  ghOauth: 'gho' + '_0123456789abcdefABCDEF0123456789abcd',
  google: 'AIza' + 'SyA0123456789abcdefghijklmnopqrstuv',
  slackBot: 'xox' + 'b-0123456789-0123456789-abcdefABCDEF0123',
  stripeLive: 'sk' + '_live_0123456789abcdefABCDEFgh',
  stripeTest: 'pk' + '_test_0123456789abcdefABCDEFgh',
  slackHook: 'https://hooks.slack.com/services/' + 'T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
  jwt: 'eyJ' + 'hbGciOiJIUzI1Ni00.eyJzdWIiOiIxMjM0NTY00.SflKxwRJSMeKKF2QT4',
  stripeWebhook: 'whsec' + '_abc123def456ghi789jkl012',
};

const SECRETS: Labeled[] = [
  { label: 'OpenAI key', text: `key: ${tok.openai}`, value: tok.openai },
  { label: 'OpenAI legacy', text: `OPENAI_API_KEY=${tok.openaiLegacy}`, value: tok.openaiLegacy },
  { label: 'Anthropic key', text: `use ${tok.anthropic}`, value: tok.anthropic },
  { label: 'GitHub PAT', text: `token ${tok.ghPat}`, value: tok.ghPat },
  { label: 'GitHub OAuth', text: `${tok.ghOauth} here`, value: tok.ghOauth },
  { label: 'AWS access key', text: 'aws creds AKIAIOSFODNN7EXAMPLE region', value: 'AKIAIOSFODNN7EXAMPLE' },
  { label: 'AWS temp key', text: 'ASIAIOSFODNN7EXAMPLE used', value: 'ASIAIOSFODNN7EXAMPLE' },
  { label: 'Google API key', text: `${tok.google} x`, value: tok.google },
  { label: 'Slack bot token', text: tok.slackBot, value: tok.slackBot },
  { label: 'Stripe secret key', text: tok.stripeLive, value: tok.stripeLive },
  { label: 'Stripe test key', text: tok.stripeTest, value: tok.stripeTest },
  { label: 'Slack webhook', text: `POST ${tok.slackHook}`, value: tok.slackHook },
  { label: 'JWT', text: `auth ${tok.jwt}`, value: tok.jwt },
  { label: 'Bearer token', text: 'Authorization: Bearer aB3dE5gH7jK9lM1nO3pQ5rS7tU9v', value: 'aB3dE5gH7jK9lM1nO3pQ5rS7tU9v' },
  { label: 'Connection string password', text: 'postgres://app:Sup3rS3cretDbP@ss@db.host:5432/prod', value: 'Sup3rS3cretDbP@ss' },
  { label: 'PEM private key', text: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ==\n-----END PRIVATE KEY-----', value: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ==\n-----END PRIVATE KEY-----' },
  { label: 'Generic high-entropy token', text: 'API_TOKEN=Xa9Kd7Lm2Qp4Rt6Vy8Zb1Nc3Wf5Hj0Gs', value: 'Xa9Kd7Lm2Qp4Rt6Vy8Zb1Nc3Wf5Hj0Gs' },
  { label: '.env DB password', text: 'connecting with s3cr3t-db-p4ssw0rd-x9 now', value: 's3cr3t-db-p4ssw0rd-x9' },
  { label: '.env Stripe webhook', text: `verify ${tok.stripeWebhook} sig`, value: tok.stripeWebhook },
];

// Decoys that MUST NOT be redacted. Structured ones are suppressed (dismissed);
// the trailing two are unstructured high-entropy blobs that the scanner cannot
// distinguish from a secret - known FPs, kept honest in the precision count.
const DECOYS: { label: string; text: string; knownFalsePositive?: boolean }[] = [
  { label: 'git SHA', text: 'commit 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b' },
  { label: 'UUID', text: 'id 550e8400-e29b-41d4-a716-446655440000' },
  { label: 'SHA-256 hash', text: 'sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { label: 'nested file path', text: 'see src/components/shell/Sidebar.tsx for that' },
  { label: 'plain prose', text: 'the quick brown fox jumps over the lazy dog repeatedly' },
  { label: 'semver + url', text: 'react 19.0.0 from https://example.com/docs/getting-started' },
  { label: 'base64 image blob', text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk', knownFalsePositive: true },
  { label: 'minified-ish token', text: 'var a=function(b){return b.split("").reverse().join("aGVsbG8gd29ybGQgZm9vYmFy")}', knownFalsePositive: true },
];

function sessionWith(text: string): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'corpus',
    meta: {},
    events: [{ kind: 'user', id: 'u1', content: [{ type: 'text', text }] }],
  };
}

const SCAN = { ...DEFAULT_SCAN_SETTINGS, envBlobs: [ENV_BLOB] };

/** A value is "caught" iff some detection holds it in the redact state. */
function isRedacted(text: string, value: string): boolean {
  return scanSession(sessionWith(text), SCAN).some(
    (d) => d.state === 'redact' && (d.value === value || d.value.includes(value) || value.includes(d.value)),
  );
}

describe('detection corpus (PRD-06 AC-10)', () => {
  it(`recall on labeled secrets meets the documented bar (>= ${DETECTION_QUALITY.recall})`, () => {
    const missed = SECRETS.filter((s) => !isRedacted(s.text, s.value));
    const recall = (SECRETS.length - missed.length) / SECRETS.length;
    // Surface exactly what slipped through, for a fast diagnosis on regression.
    expect(missed.map((m) => m.label), `missed secrets`).toEqual([]);
    expect(recall).toBeGreaterThanOrEqual(DETECTION_QUALITY.recall);
  });

  it(`precision over secrets + decoys meets the documented bar (>= ${DETECTION_QUALITY.precision})`, () => {
    // Scan one session holding everything, so cross-talk between values is real.
    const all = sessionWith([...SECRETS.map((s) => s.text), ...DECOYS.map((d) => d.text)].join('\n'));
    const redacted = scanSession(all, SCAN).filter((d) => d.state === 'redact');
    const secretValues = new Set(SECRETS.map((s) => s.value));
    const truePos = redacted.filter(
      (d) => secretValues.has(d.value) || SECRETS.some((s) => s.value.includes(d.value) || d.value.includes(s.value)),
    );
    const precision = redacted.length === 0 ? 1 : truePos.length / redacted.length;
    expect(precision).toBeGreaterThanOrEqual(DETECTION_QUALITY.precision);
  });

  it('structured decoys are never redacted (suppressed or unflagged)', () => {
    for (const decoy of DECOYS) {
      if (decoy.knownFalsePositive) continue;
      const redacted = scanSession(sessionWith(decoy.text), SCAN).filter((d) => d.state === 'redact');
      expect(redacted, `decoy redacted: ${decoy.label}`).toEqual([]);
    }
  });

  it('corpus size matches the documented figure', () => {
    expect(SECRETS.length + DECOYS.length).toBe(DETECTION_QUALITY.corpusSize);
  });
});
