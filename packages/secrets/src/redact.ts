// Redactor (PRD-06 FR-20…FR-27): turn confirmed detections into a placeholder
// body + a secret map. Redaction is by VALUE — every exact occurrence of a
// confirmed value, anywhere in the scannable strings, becomes its token. This
// guarantees the hard gate (FR-25): no confirmed value survives in the body.

import type { Session } from '@claudepad/schema';
import type { Detection, RedactionResult, SecretMap } from './model';
import { mapSessionStrings } from './text';
import { makeSecretToken, sanitizeType, neutralizeSentinels } from './placeholder';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produce `{ body, secretMap }` from confirmed (state==='redact') detections.
 * Dismissed detections are intentionally left as plaintext in the body (FR-24).
 */
export function redact(session: Session, detections: Detection[]): RedactionResult {
  const confirmed = detections.filter((d) => d.state === 'redact' && d.value.length > 0);

  // Replace longer values first so a value that is a substring of another can't
  // partially clobber it.
  const ordered = [...confirmed].sort((a, b) => b.value.length - a.value.length);

  const secretMap: SecretMap = {};
  for (const d of ordered) {
    const type = sanitizeType(d.type);
    secretMap[d.id] = { value: d.value, type, len: d.length };
  }

  const replacers = ordered.map((d) => ({
    re: new RegExp(escapeRegExp(d.value), 'g'),
    token: makeSecretToken(d.id, sanitizeType(d.type), d.length),
  }));

  const body = mapSessionStrings(session, (s) => {
    // Neutralize any pre-existing sentinels so they can't masquerade as tokens.
    let out = neutralizeSentinels(s);
    for (const { re, token } of replacers) out = out.replace(re, token);
    return out;
  });

  return { body, secretMap };
}

/**
 * Verify the hard gate (FR-25): no confirmed secret value appears as a substring
 * of the serialized body. Returns the offending values (empty === pass). Exposed
 * so the share flow can assert before encrypting.
 */
export function findLeakedValues(body: Session, secretMap: SecretMap): string[] {
  const serialized = JSON.stringify(body);
  const leaked: string[] = [];
  for (const { value } of Object.values(secretMap)) {
    if (value.length > 0 && serialized.includes(value)) leaked.push(value);
  }
  return leaked;
}
