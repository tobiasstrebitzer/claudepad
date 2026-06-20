// The three independent detection signals (PRD-06 FR-2): known prefixes/shapes,
// Shannon-entropy heuristics, and exact .env value matching. Each emits raw hits
// (value + type + signal); scan.ts coalesces them into logical Detections.

import type { SignalKind } from './model';

/** A raw candidate before coalescing: one matched value with its firing signal. */
export interface RawHit {
  value: string;
  type: string;
  signal: SignalKind;
  /** Higher = more likely a real secret; used only for review ordering. */
  confidence: number;
}

// ── Prefix / shape detectors (FR-2a, taxonomy §7.3) ────────────────────────────
// Each pattern's first capture group (or whole match) is the secret value.

interface PrefixDetector {
  type: string;
  re: RegExp;
  confidence: number;
}

const PREFIX_DETECTORS: PrefixDetector[] = [
  { type: 'OPENAI_KEY', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g, confidence: 0.98 },
  { type: 'GH_TOKEN', re: /\bgh[poausr]_[A-Za-z0-9]{30,}\b/g, confidence: 0.98 },
  { type: 'AWS_KEY', re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/g, confidence: 0.97 },
  { type: 'GOOGLE_API_KEY', re: /\bAIza[A-Za-z0-9_-]{35}\b/g, confidence: 0.96 },
  { type: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, confidence: 0.97 },
  {
    type: 'STRIPE_KEY',
    re: /\b[srp]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    confidence: 0.96,
  },
  {
    type: 'SLACK_WEBHOOK',
    re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
    confidence: 0.95,
  },
  { type: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, confidence: 0.9 },
  { type: 'BEARER_TOKEN', re: /\bBearer\s+([A-Za-z0-9._-]{16,})/g, confidence: 0.85 },
];

const PEM_RE =
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g;

// scheme://user:password@host — capture the password (OQ-A: password-only default).
const CONNECTION_STRING_RE =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|rediss):\/\/[^:\s/]+:([^@\s/]+)@/g;

export function detectPrefixes(text: string): RawHit[] {
  const hits: RawHit[] = [];

  for (const d of PREFIX_DETECTORS) {
    for (const m of text.matchAll(d.re)) {
      // Use the capture group when present (e.g. Bearer <token>), else whole match.
      const value = m[1] ?? m[0];
      if (value) hits.push({ value, type: d.type, signal: 'prefix', confidence: d.confidence });
    }
  }

  for (const m of text.matchAll(PEM_RE)) {
    hits.push({ value: m[0], type: 'PEM_PRIVATE_KEY', signal: 'prefix', confidence: 0.99 });
  }

  for (const m of text.matchAll(CONNECTION_STRING_RE)) {
    const pass = m[1];
    if (pass) {
      hits.push({ value: pass, type: 'CONNECTION_STRING', signal: 'prefix', confidence: 0.9 });
    }
  }

  return hits;
}

// ── Entropy detector (FR-2b, FR-4, FR-5) ───────────────────────────────────────

const TOKEN_RE = /[A-Za-z0-9_\-+/=]{16,}/g;

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Map a 0..1 sensitivity to an entropy threshold (higher sensitivity → lower bar). */
function entropyThreshold(sensitivity: number): number {
  const clamped = Math.max(0, Math.min(1, sensitivity));
  return 4.6 - clamped * 1.6; // 0 → 4.6 (strict), 1 → 3.0 (aggressive)
}

const SUPPRESSORS: { reason: string; test: (v: string) => boolean }[] = [
  { reason: 'looks like a UUID', test: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) },
  { reason: 'looks like a git SHA', test: (v) => /^[0-9a-f]{40}$/i.test(v) },
  { reason: 'looks like a SHA-256 hash', test: (v) => /^[0-9a-f]{64}$/i.test(v) },
  { reason: 'looks like a file path', test: (v) => /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){2,}$/.test(v) },
];

/** Reason this token is a likely false positive, if any (down-rank, never drop). */
export function suppressorReason(value: string): string | undefined {
  return SUPPRESSORS.find((s) => s.test(value))?.reason;
}

export function detectEntropy(
  text: string,
  sensitivity: number,
  minTokenLength: number,
): RawHit[] {
  const threshold = entropyThreshold(sensitivity);
  const hits: RawHit[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const value = m[0];
    if (value.length < minTokenLength) continue;
    // Require some character-class mix (or long hex) to skip prose-y tokens.
    const mixed = /[A-Za-z]/.test(value) && /[0-9]/.test(value);
    const longHex = /^[0-9a-f]{32,}$/i.test(value);
    if (!mixed && !longHex) continue;
    const h = shannonEntropy(value);
    if (h < threshold) continue;
    hits.push({ value, type: 'HIGH_ENTROPY', signal: 'entropy', confidence: 0.4 + (h - threshold) / 10 });
  }
  return hits;
}

// ── .env / .dev.vars exact matcher (FR-2c, FR-6, FR-7) ─────────────────────────

/** Parse KEY=VALUE pairs from a pasted .env/.dev.vars blob (handles quotes/export/#). */
export function parseEnv(blob: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const rawLine of blob.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7) : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    // Strip a trailing inline comment only when unquoted.
    if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, '').trim();
    // Unwrap matching quotes.
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (key && value) out.push({ key, value });
  }
  return out;
}

const TRIVIAL_ENV = new Set(['true', 'false', 'localhost', '127.0.0.1', '0.0.0.0']);

/** Build the env-exact detectors from pasted blobs (FR-6/FR-7). */
export function envDetectors(
  blobs: string[],
  minValueLength: number,
): { key: string; value: string }[] {
  const seen = new Set<string>();
  const out: { key: string; value: string }[] = [];
  for (const blob of blobs) {
    for (const { key, value } of parseEnv(blob)) {
      if (value.length < minValueLength) continue;
      if (TRIVIAL_ENV.has(value.toLowerCase())) continue;
      if (/^\d+$/.test(value)) continue; // bare ports/integers
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ key, value });
    }
  }
  return out;
}

/** Find every occurrence of each pasted .env value (FR-6). */
export function detectEnv(
  text: string,
  detectors: { key: string; value: string }[],
): RawHit[] {
  const hits: RawHit[] = [];
  for (const { key, value } of detectors) {
    if (text.includes(value)) {
      hits.push({ value, type: `ENV:${key}`, signal: 'env-exact', confidence: 1 });
    }
  }
  return hits;
}
