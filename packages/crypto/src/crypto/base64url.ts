// base64url (RFC 4648 §5, NO padding) + UTF-8 helpers.
//
// Implemented without Node's Buffer so this module is isomorphic (browser + Node 20+).
// We bridge raw bytes through `btoa`/`atob` (both available in browsers and Node 20+),
// mapping `+/` <-> `-_` and stripping `=` padding. Large inputs are chunked to avoid
// blowing the argument limit of `String.fromCharCode`.

import { CryptoFormatError } from './errors';

const CHUNK = 0x8000; // 32k bytes per fromCharCode call - safely under arg limits.

/** Encode bytes as base64url (no padding). */
export function bytesToB64url(u8: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    const slice = u8.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (padding optional) to bytes. Throws CryptoFormatError on malformed input. */
export function b64urlToBytes(s: string): Uint8Array {
  if (typeof s !== 'string') {
    throw new CryptoFormatError('base64url input must be a string');
  }
  if (/[^A-Za-z0-9\-_=]/.test(s)) {
    throw new CryptoFormatError('malformed base64url: invalid characters');
  }
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(padLen);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new CryptoFormatError('malformed base64url: cannot decode');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode a string to UTF-8 bytes. */
export function utf8ToBytes(s: string): Uint8Array {
  return encoder.encode(s);
}

/** Decode UTF-8 bytes to a string. */
export function bytesToUtf8(u8: Uint8Array): string {
  return decoder.decode(u8);
}
