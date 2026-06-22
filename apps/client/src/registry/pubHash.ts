import { b64urlToBytes } from '@claudepad/shared'

/**
 * The opaque inbox/auth key for an identity: hex SHA-256 of its raw public key.
 * Used as the bearer token for authenticated registry routes and as the
 * `indexFor` value when opt-in inbox indexing is requested. Content stays
 * client-encrypted; this only ever identifies a public key.
 */
export async function pubHash(pub: string): Promise<string> {
  const raw = b64urlToBytes(pub)
  // Copy into a concrete ArrayBuffer (subtle.digest wants a non-shared buffer).
  const buf = new ArrayBuffer(raw.byteLength)
  new Uint8Array(buf).set(raw)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
