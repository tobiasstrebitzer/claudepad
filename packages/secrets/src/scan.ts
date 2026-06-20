// Scan orchestrator (PRD-06 §6.2, FR-1…FR-9): run the three detectors over every
// scannable string, coalesce raw hits to one logical Detection per value, mask a
// snippet for review, down-rank suppressed shapes, and assign opaque ids.

import type { Session } from '@claudepad/schema';
import {
  type Detection,
  type SignalKind,
  type ScanSettings,
  DEFAULT_SCAN_SETTINGS,
} from './model';
import { collectStrings } from './text';
import {
  detectPrefixes,
  detectEntropy,
  detectEnv,
  envDetectors,
  suppressorReason,
  type RawHit,
} from './detectors';

/** A short, value-free locator for the review list (FR-12): a few leading chars. */
function maskSnippet(value: string): string {
  const head = value.slice(0, 4);
  const tailLen = Math.max(0, value.length - 4);
  return `${head}${'•'.repeat(Math.min(tailLen, 8))}${value.length > 12 ? `(${value.length})` : ''}`;
}

/** A small, dependency-free opaque id (`s` + random base36). Per-session (FR-22). */
function randomId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(5));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return 's' + n.toString(36);
}

/**
 * Scan a normalized session for candidate secrets. Deterministic for a given
 * session + settings except for the random ids (FR-9/FR-22). Runs on the calling
 * thread; a Web Worker variant is a documented follow-up (FR-10).
 */
export function scanSession(
  session: Session,
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS,
): Detection[] {
  const strings = collectStrings(session);
  const env = envDetectors(settings.envBlobs, settings.envMinValueLength);

  // value → aggregated detection fields.
  const byValue = new Map<
    string,
    { type: string; signals: Set<SignalKind>; confidence: number; occurrences: number }
  >();

  const addHit = (hit: RawHit) => {
    const existing = byValue.get(hit.value);
    if (existing) {
      existing.signals.add(hit.signal);
      existing.occurrences += 1;
      // Prefer the higher-confidence label (prefix/env beat entropy's catch-all).
      if (hit.confidence > existing.confidence) {
        existing.confidence = hit.confidence;
        existing.type = hit.type;
      }
    } else {
      byValue.set(hit.value, {
        type: hit.type,
        signals: new Set([hit.signal]),
        confidence: hit.confidence,
        occurrences: 1,
      });
    }
  };

  for (const text of strings) {
    detectPrefixes(text).forEach(addHit);
    detectEntropy(text, settings.entropySensitivity, settings.entropyMinTokenLength).forEach(addHit);
    detectEnv(text, env).forEach(addHit);
  }

  const detections: Detection[] = [];
  for (const [value, agg] of byValue) {
    // A high-confidence prefix/env hit overrides entropy suppression.
    const onlyEntropy = agg.signals.size === 1 && agg.signals.has('entropy');
    const suppressedReason = onlyEntropy ? suppressorReason(value) : undefined;
    detections.push({
      id: randomId(),
      type: agg.type,
      value,
      length: value.length,
      occurrences: agg.occurrences,
      snippet: maskSnippet(value),
      signals: [...agg.signals],
      confidence: agg.confidence,
      suppressedReason,
      // Recall-biased default; suppressed shapes pre-dismissed (OQ-E resolution).
      state: suppressedReason ? 'dismissed' : 'redact',
    });
  }

  // Recall-first ordering: highest confidence on top, suppressed at the bottom.
  detections.sort((a, b) => {
    if (Boolean(a.suppressedReason) !== Boolean(b.suppressedReason)) {
      return a.suppressedReason ? 1 : -1;
    }
    return b.confidence - a.confidence;
  });

  return detections;
}
