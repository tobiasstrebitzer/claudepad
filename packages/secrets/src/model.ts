// Core types for secret detection + redaction (PRD-06 §7.2). The scanner emits
// Detection[]; the user reviews (redact / dismiss); the redactor turns confirmed
// detections into a placeholder body + a secret map handed to the crypto core.

import type { Session } from '@claudepad/schema';

/** Which signal(s) flagged a candidate (a detection may carry more than one). */
export type SignalKind = 'prefix' | 'entropy' | 'env-exact';

/** Whether a confirmed detection is redacted or left in plaintext by the user. */
export type DetectionState = 'redact' | 'dismissed';

/**
 * A single logical secret. Redaction is by *value* (every exact occurrence is
 * replaced), so one logical secret == one value == one opaque id `S#`.
 */
export interface Detection {
  /** Opaque, per-session-random id; the placeholder + secret-map key (FR-22). */
  id: string;
  /** Label class shown to viewers, e.g. 'AWS_KEY', 'ENV:DB_PASS' (FR-3). */
  type: string;
  /** Plaintext value — memory only, never logged/persisted (FR-23). */
  value: string;
  /** Character count of the value, shown in the low-priv label (never the value). */
  length: number;
  /** Number of occurrences across the session (UI context). */
  occurrences: number;
  /** A masked, value-free snippet for the review list (FR-12). */
  snippet: string;
  /** Why it fired — at least one (FR-3). */
  signals: SignalKind[];
  /** Ordering hint for the review list; never shown to viewers (FR-3). */
  confidence: number;
  /** Set when down-ranked as a likely false positive (FR-5); never silently dropped. */
  suppressedReason?: string;
  /** redact (default) or dismissed (default for suppressed) (FR-13). */
  state: DetectionState;
}

/** A secret-map entry: the plaintext + render hints. Encrypted under K_secret. */
export interface SecretEntry {
  value: string;
  type: string;
  len: number;
}

/** id (`S#`) → entry. Handed to the crypto core to encrypt under K_secret (FR-23). */
export type SecretMap = Record<string, SecretEntry>;

/** Tunables for a scan. All defaults are recall-biased (Q-4). */
export interface ScanSettings {
  /** 0..1; higher = more aggressive entropy flagging. Default 0.5 (recall-biased). */
  entropySensitivity: number;
  /** Pasted .env / .dev.vars blobs — memory only, never persisted (FR-6). */
  envBlobs: string[];
  /** Skip trivially short .env values (FR-7). */
  envMinValueLength: number;
  /** Minimum token length for entropy candidates (FR-4). */
  entropyMinTokenLength: number;
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  entropySensitivity: 0.5,
  envBlobs: [],
  envMinValueLength: 8,
  entropyMinTokenLength: 20,
};

/** The redactor's output: a placeholder body + the encrypted-bound secret map. */
export interface RedactionResult {
  /** Structurally-identical session with confirmed secrets replaced by tokens. */
  body: Session;
  /** Plaintext values for the granted (high-priv) tier (FR-23, FR-27). */
  secretMap: SecretMap;
}
