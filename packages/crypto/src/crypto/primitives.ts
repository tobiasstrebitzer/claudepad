// Low-level WebCrypto wrappers - pure, zero-dependency, isomorphic. Uses
// globalThis.crypto so it runs identically in browsers and Node 20+ (no
// `node:crypto` import).

import { bytesToB64url, b64urlToBytes, utf8ToBytes } from './base64url'
import { CryptoAuthError } from './errors'

const subtle = globalThis.crypto.subtle

/** ECDH P-256 algorithm identifier. */
export const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

// TS 5.7+ types WebCrypto inputs as `BufferSource` backed by a plain `ArrayBuffer`,
// while our byte arrays are typed `Uint8Array<ArrayBufferLike>`. At runtime these are
// always ArrayBuffer-backed; this coerces a view into an exact ArrayBuffer-backed one
// (copying only if the underlying buffer isn't a plain ArrayBuffer, e.g. SharedArrayBuffer).
export function ab(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u8.buffer instanceof ArrayBuffer) {
    return u8 as Uint8Array<ArrayBuffer>
  }
  return new Uint8Array(u8)
}

/** A single AES-GCM layer: base64url IV + ciphertext (tag suffixed by WebCrypto). */
export interface AesLayer {
  iv: string
  ct: string
}

/** Cryptographically random bytes. */
export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

/** AES-256-GCM encrypt with a fresh 12-byte IV and 128-bit tag. */
export async function aesEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array
): Promise<AesLayer> {
  const iv = randomBytes(12)
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv: ab(iv), tagLength: 128 },
    key,
    ab(plaintext)
  )
  return { iv: bytesToB64url(iv), ct: bytesToB64url(new Uint8Array(ct)) }
}

/** AES-256-GCM decrypt. A failed tag check (wrong key / tamper) maps to CryptoAuthError. */
export async function aesDecrypt(key: CryptoKey, layer: AesLayer): Promise<Uint8Array> {
  const iv = b64urlToBytes(layer.iv)
  const ct = b64urlToBytes(layer.ct)
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: ab(iv), tagLength: 128 },
      key,
      ab(ct)
    )
    return new Uint8Array(pt)
  } catch {
    // WebCrypto throws an OperationError on auth failure - never leak it raw.
    throw new CryptoAuthError('AES-GCM authentication failed')
  }
}

/** Generate a fresh random AES-256-GCM content key (extractable, so it can be wrapped). */
export async function generateContentKey(): Promise<{ raw: Uint8Array; key: CryptoKey }> {
  const raw = randomBytes(32)
  const key = await subtle.importKey('raw', ab(raw), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt'
  ])
  return { raw, key }
}

/** Import raw 32-byte material as an AES-256-GCM key. */
export async function importContentKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) {
    throw new CryptoAuthError('content key must be 32 bytes')
  }
  return subtle.importKey('raw', ab(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt'
  ])
}

// HKDF `info` domain-separation strings. These are internal labels: both sides of
// every exchange are our own code, so the exact value is arbitrary as long as it
// stays stable.
const SHARE_INFO = utf8ToBytes('claudepad-share-v1')
const DEVICE_KEK_INFO = utf8ToBytes('claudepad-device-kek-v1')

/**
 * Derive the per-share wrapping key: ECDH(priv, pub) -> 256-bit shared secret ->
 * HKDF-SHA256 (empty salt, info=`claudepad-share-v1`) -> AES-256-GCM key.
 * ECDH is symmetric, so sender(eph_priv, recip_pub) and recipient(recip_priv, eph_pub)
 * derive the identical key.
 */
export async function deriveWrappingKey(
  privKey: CryptoKey,
  pubKey: CryptoKey
): Promise<CryptoKey> {
  const bits = new Uint8Array(
    await subtle.deriveBits({ name: 'ECDH', public: pubKey }, privKey, 256)
  )
  const hk = await subtle.importKey('raw', ab(bits), 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: ab(SHARE_INFO) },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Derive a device key-encryption-key from a WebAuthn-PRF output (pattern A).
 * HKDF-SHA256 (empty salt, info=`claudepad-device-kek-v1`) -> AES-256-GCM.
 * Verified by test/conformance.test.ts.
 */
export async function deriveDeviceKEK(prfBytes: Uint8Array): Promise<CryptoKey> {
  const hk = await subtle.importKey('raw', ab(prfBytes), 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: ab(DEVICE_KEK_INFO) },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}
