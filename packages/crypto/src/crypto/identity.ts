// Identity types + (de)serialization helpers. An identity is an ECDH P-256 keypair
// plus a self-claimed display name (the name asserts nothing - trust comes from the
// fingerprint, see fingerprint.ts). Verified end-to-end by test/conformance.test.ts.

import { bytesToB64url, b64urlToBytes, utf8ToBytes, bytesToUtf8 } from './base64url'
import { ECDH, ab } from './primitives'
import { CryptoFormatError, CryptoVersionError } from './errors'

const subtle = globalThis.crypto.subtle

/** The secret identity - includes the private key (JWK). Back this up; never share it. */
export interface Identity {
  v: 1
  name: string
  pub: string // raw public key, base64url
  priv: JsonWebKey
}

/** The public card - safe to post; this is what someone pastes to share *with you*. */
export interface PublicCard {
  v: 1
  name: string
  pub: string // raw public key, base64url
}

/** Mint a fresh local identity (ECDH P-256, extractable so it can be backed up). */
export async function mintIdentity(name: string): Promise<Identity> {
  const kp = await subtle.generateKey(ECDH, true, ['deriveBits'])
  const pubRaw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey))
  const priv = await subtle.exportKey('jwk', kp.privateKey)
  return { v: 1, name, pub: bytesToB64url(pubRaw), priv }
}

/** Project a secret identity to its shareable public card. */
export function toPublicCard(id: Identity): PublicCard {
  return { v: 1, name: id.name, pub: id.pub }
}

/** Encode a public card (or an identity, narrowed to its public fields) as base64url(JSON). */
export function encodePublicCard(input: PublicCard | Identity): string {
  const card: PublicCard = { v: 1, name: input.name, pub: input.pub }
  return bytesToB64url(utf8ToBytes(JSON.stringify(card)))
}

/** Decode a base64url(JSON) public card, validating its shape. */
export function decodePublicCard(s: string): PublicCard {
  const parsed = parseJson(s)
  if (parsed.v !== 1) {
    throw new CryptoVersionError(`unsupported public card version: ${String(parsed.v)}`)
  }
  if (typeof parsed.name !== 'string' || typeof parsed.pub !== 'string') {
    throw new CryptoFormatError('malformed public card: missing name/pub')
  }
  return { v: 1, name: parsed.name, pub: parsed.pub }
}

/** Encode the full secret identity (incl. private JWK) as base64url(JSON). */
export function encodeIdentitySecret(id: Identity): string {
  return bytesToB64url(utf8ToBytes(JSON.stringify(id)))
}

/** Decode a base64url(JSON) secret identity, validating its shape. */
export function decodeIdentitySecret(s: string): Identity {
  const parsed = parseJson(s)
  if (parsed.v !== 1) {
    throw new CryptoVersionError(`unsupported identity version: ${String(parsed.v)}`)
  }
  if (
    typeof parsed.name !== 'string' ||
    typeof parsed.pub !== 'string' ||
    typeof parsed.priv !== 'object' ||
    parsed.priv === null
  ) {
    throw new CryptoFormatError('malformed identity secret: missing name/pub/priv')
  }
  return { v: 1, name: parsed.name, pub: parsed.pub, priv: parsed.priv as JsonWebKey }
}

/** Import the private key from a secret identity for ECDH deriveBits. */
export function importPrivateKey(id: Identity): Promise<CryptoKey> {
  return subtle.importKey('jwk', id.priv, ECDH, false, ['deriveBits'])
}

/** Import a raw base64url public key for ECDH key agreement. */
export function importPublicKey(pubB64: string): Promise<CryptoKey> {
  return subtle.importKey('raw', ab(b64urlToBytes(pubB64)), ECDH, false, [])
}

function parseJson(s: string): Record<string, unknown> {
  let obj: unknown
  try {
    obj = JSON.parse(bytesToUtf8(b64urlToBytes(s)))
  } catch {
    throw new CryptoFormatError(
      'malformed encoded card/identity: not valid base64url(JSON)'
    )
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new CryptoFormatError('malformed encoded card/identity: not an object')
  }
  return obj as Record<string, unknown>
}
