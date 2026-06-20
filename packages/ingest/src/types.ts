// Pure ingest contracts (PRD-04 §7). No runtime deps; browser + Node identical.

/** The shape of a pasted/dropped payload, used to route into the PRD-02 parser. */
export type IngestShape = 'jsonl' | 'json-object' | 'json-array' | 'ndjson' | 'unknown';

/** Operating system, for onboarding path guidance (FR-7). */
export type OS = 'mac' | 'linux' | 'win' | 'wsl';

/** OS-specific guidance shown in the first-run empty state (FR-7/FR-8). */
export interface OnboardingInfo {
  os: OS;
  label: string;
  /** Where Claude Code session files live on this OS. */
  path: string;
  /** A copy-pasteable one-liner that lists recent sessions, newest first. */
  listOneLiner: string;
}

/** Soft/hard byte caps for a single session (FR-16). */
export interface SizeCaps {
  soft: number;
  hard: number;
}

/** Verdict of a size check against the caps. */
export interface SizeVerdict {
  bytes: number;
  overSoftCap: boolean;
  overHardCap: boolean;
}
