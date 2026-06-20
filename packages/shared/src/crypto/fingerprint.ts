// Human-verifiable key fingerprint: SHA-256 over the RAW public key bytes, rendered
// as 6 emoji (palette of 64, via `byte & 63`) + an 8-hex code formatted `XXXX-XXXX`.
// EXACTLY mirrors poc/verify.mjs (digests the decoded raw key bytes, not the b64 string).

import { b64urlToBytes } from './base64url';
import { ab } from './primitives';

const subtle = globalThis.crypto.subtle;

// 64-emoji palette — copied verbatim from poc/verify.mjs (must stay in sync).
const FP_EMOJI = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😅',
  '😊',
  '😍',
  '😎',
  '🤔',
  '😴',
  '🥳',
  '😇',
  '🤩',
  '😜',
  '😬',
  '🙃',
  '🐶',
  '🐱',
  '🐭',
  '🐹',
  '🐰',
  '🦊',
  '🐻',
  '🐼',
  '🐨',
  '🐯',
  '🦁',
  '🐮',
  '🐷',
  '🐸',
  '🐵',
  '🦄',
  '🍎',
  '🍌',
  '🍇',
  '🍓',
  '🍉',
  '🍒',
  '🍑',
  '🥝',
  '🍍',
  '🥑',
  '🌽',
  '🥕',
  '🍔',
  '🍕',
  '🌮',
  '🍩',
  '⚽',
  '🏀',
  '🏈',
  '🎾',
  '🎲',
  '🎸',
  '🎹',
  '🎺',
  '🚗',
  '🚀',
  '🛸',
  '⛵',
  '🏰',
  '🌈',
  '⭐',
  '🔥',
] as const;

/** Compute the 6-emoji + 8-hex fingerprint of a raw base64url public key. */
export async function fingerprint(
  pubB64: string,
): Promise<{ emoji: string; code: string }> {
  const raw = b64urlToBytes(pubB64);
  const h = new Uint8Array(await subtle.digest('SHA-256', ab(raw)));
  // `b & 63` is always in [0, 63] and FP_EMOJI has 64 entries, so this is total;
  // the `?? ''` only satisfies noUncheckedIndexedAccess and is never hit.
  const emoji = [...h.slice(0, 6)].map((b) => FP_EMOJI[b & 63] ?? '').join(' ');
  const code = [...h.slice(6, 10)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .replace(/(.{4})(.{4})/, '$1-$2');
  return { emoji, code };
}
