// Client orchestration of the trustless share artifact (PRD-11). The crypto -
// the ephemeral sealed box, the two content keys, the recipient wrap - lives in
// @claudepad/shared (proven by poc/verify.mjs). This layer turns a redacted
// session + secret map into the wire form `cp-blob-<base64url(JSON)>` and back,
// and decodes the decrypted bytes into a Session + SecretMap for the viewer.

import {
  createBlob,
  openBlob,
  encodeBlob,
  decodeBlob,
  bytesToB64url,
  b64urlToBytes,
  utf8ToBytes,
  bytesToUtf8,
  type Identity,
  type Tier
} from '@claudepad/shared'
import type { Session } from '@claudepad/schema'
import type { SecretMap } from '@claudepad/secrets'
import { CP_BLOB_PREFIX } from './detect'

export interface CreateShareOpts {
  sender: Identity
  /** Recipient public card (`cp-pub-…`) or its prefix-free base64url body. */
  recipientCard: string
  body: Session
  secretMap: SecretMap
  tier: Tier
}

const PUB_PREFIX = 'cp-pub-'

/** Build a `cp-blob-…` string addressed to the recipient at the chosen tier. */
export async function createShare(opts: CreateShareOpts): Promise<string> {
  const card = opts.recipientCard.trim().startsWith(PUB_PREFIX)
    ? opts.recipientCard.trim().slice(PUB_PREFIX.length)
    : opts.recipientCard.trim()

  const blob = await createBlob({
    sender: opts.sender,
    recipientCard: card,
    bodyBytes: utf8ToBytes(JSON.stringify(opts.body)),
    secretBytes:
      opts.tier === 'body+secret'
        ? utf8ToBytes(JSON.stringify(opts.secretMap))
        : undefined,
    tier: opts.tier
  })

  return CP_BLOB_PREFIX + bytesToB64url(utf8ToBytes(encodeBlob(blob)))
}

export interface OpenShareResult {
  from: { name: string; pub: string }
  tier: Tier
  session: Session
  secretMap: SecretMap | null
}

/**
 * Decrypt a `cp-blob-…` addressed to `me`. A blob not addressed to us fails the
 * AES-GCM wrap tag inside openBlob (CryptoAuthError) - fail-closed, no partial
 * render (PRD-11 FR-11).
 */
export async function openShare(me: Identity, encoded: string): Promise<OpenShareResult> {
  const trimmed = encoded.trim()
  const b64 = trimmed.startsWith(CP_BLOB_PREFIX)
    ? trimmed.slice(CP_BLOB_PREFIX.length)
    : trimmed
  const blob = decodeBlob(bytesToUtf8(b64urlToBytes(b64)))

  const opened = await openBlob({ me, blob })

  // The body is a serialized normalized Session - re-parse defensively so a
  // hostile/corrupt blob can't smuggle a non-conforming object into the viewer.
  const session = sessionFromBytes(opened.bodyBytes)
  const secretMap =
    opened.secretBytes != null
      ? (JSON.parse(bytesToUtf8(opened.secretBytes)) as SecretMap)
      : null

  return { from: opened.from, tier: opened.tier, session, secretMap }
}

function sessionFromBytes(bytes: Uint8Array): Session {
  const obj = JSON.parse(bytesToUtf8(bytes)) as unknown
  if (typeof obj !== 'object' || obj === null || !Array.isArray((obj as Session).events)) {
    throw new Error('Decrypted payload is not a session.')
  }
  return obj as Session
}
