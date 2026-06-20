// Pattern-A device protection (data layer only — no WebAuthn here, that's PRD-10).
// The identity at rest is wrapped under a KEK derived from a WebAuthn-PRF output, so
// the private key is encrypted until a passkey unlock re-derives the same KEK.
// Mirrors poc/verify.mjs test [6].

import { utf8ToBytes, bytesToUtf8 } from './base64url';
import { aesEncrypt, aesDecrypt, deriveDeviceKEK, type AesLayer } from './primitives';
import { type Identity } from './identity';
import { CryptoFormatError, CryptoVersionError } from './errors';

/** Encrypt a secret identity under a device KEK derived from `prfBytes`. */
export async function wrapIdentity(
  id: Identity,
  prfBytes: Uint8Array,
): Promise<AesLayer> {
  const kek = await deriveDeviceKEK(prfBytes);
  return aesEncrypt(kek, utf8ToBytes(JSON.stringify(id)));
}

/**
 * Decrypt a device-wrapped identity. A wrong/absent PRF derives a different KEK, so
 * the AES-GCM tag fails -> CryptoAuthError (surfaced by aesDecrypt).
 */
export async function unwrapIdentity(
  wrapped: AesLayer,
  prfBytes: Uint8Array,
): Promise<Identity> {
  const kek = await deriveDeviceKEK(prfBytes);
  const bytes = await aesDecrypt(kek, wrapped);
  return parseIdentityJson(bytes);
}

function parseIdentityJson(bytes: Uint8Array): Identity {
  let obj: unknown;
  try {
    obj = JSON.parse(bytesToUtf8(bytes));
  } catch {
    throw new CryptoFormatError('unwrapped identity is not valid JSON');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new CryptoFormatError('unwrapped identity is not an object');
  }
  const id = obj as Record<string, unknown>;
  if (id.v !== 1) {
    throw new CryptoVersionError(`unsupported identity version: ${String(id.v)}`);
  }
  if (
    typeof id.name !== 'string' ||
    typeof id.pub !== 'string' ||
    typeof id.priv !== 'object' ||
    id.priv === null
  ) {
    throw new CryptoFormatError('unwrapped identity missing name/pub/priv');
  }
  return { v: 1, name: id.name, pub: id.pub, priv: id.priv as JsonWebKey };
}
