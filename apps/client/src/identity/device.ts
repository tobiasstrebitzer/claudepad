// Device protection (PRD-10 §6.4, FR-13…FR-16) - pattern A, the default.
//
// WebAuthn is used purely as a *local PRF oracle*: a passkey deterministically
// returns 32 bytes for a fixed app salt, we HKDF that into a KEK (shared
// deriveDeviceKEK), and the KEK wraps the identity secret. No attestation, no
// server, nothing registered anywhere. The PRF is evaluated *at registration*
// (`prf.eval` on create) so protecting takes a single ceremony - only when an
// authenticator can't return PRF at create do we fall back to a second get().
// This mirrors the proven poc/ flow exactly.

import {
  ab,
  wrapIdentity,
  unwrapIdentity,
  bytesToB64url,
  b64urlToBytes,
  utf8ToBytes,
  type Identity
} from '@claudepad/crypto'
import type { StoredProtected } from './storage'

const subtle = globalThis.crypto.subtle

/** Fixed app constant - domain-separates our PRF output from any other use. */
const PRF_SALT_SEED = 'claudepad-prf-salt-v1'

/**
 * Device protection is offered only when WebAuthn exists *and* the page has a
 * real origin (WebAuthn refuses `file://`). Elsewhere we degrade with a note
 * rather than a broken button (FR-13).
 */
export function deviceProtectionAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    window.location.protocol !== 'file:'
  )
}

async function prfSalt(): Promise<Uint8Array> {
  const h = await subtle.digest('SHA-256', ab(utf8ToBytes(PRF_SALT_SEED)))
  return new Uint8Array(h)
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

// The PRF extension is newer than some TS lib.dom versions; describe just the
// shape we touch so we stay strict without `any`.
interface PrfResults { results?: { first?: BufferSource }; enabled?: boolean }
interface PrfExtResults { prf?: PrfResults }
interface PrfEval { prf: { eval: { first: BufferSource } } }

function prfFirst(cred: PublicKeyCredential): Uint8Array | null {
  const ext = cred.getClientExtensionResults() as PrfExtResults
  const first = ext.prf?.results?.first
  return first ? new Uint8Array(first as ArrayBuffer) : null
}

class DeviceError extends Error {
  override name = 'DeviceError'
}

/**
 * Create a passkey for this identity and obtain its PRF output (FR-14). Returns
 * the wrapped identity + credential id, ready to persist as a StoredProtected.
 * Throws a friendly DeviceError if the authenticator lacks PRF support.
 */
export async function protectWithDevice(id: Identity): Promise<StoredProtected> {
  const salt = await prfSalt()
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: ab(randomBytes(32)),
      rp: { name: 'claudepad', id: window.location.hostname },
      user: {
        id: ab(randomBytes(16)),
        name: `${id.name} · claudepad`,
        displayName: id.name
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: ab(salt) } } } as unknown as PrfEval,
      timeout: 60_000
    }
  })) as PublicKeyCredential | null

  if (!cred) throw new DeviceError('Passkey creation was cancelled.')

  const ext = cred.getClientExtensionResults() as PrfExtResults
  if (ext.prf?.enabled === false) {
    throw new DeviceError(
      'This authenticator does not support the PRF extension. Try a platform passkey (Touch ID / Windows Hello) or a recent security key.'
    )
  }

  // PRF returned at create ⇒ single prompt; otherwise fall back to one get().
  const credentialId = new Uint8Array(cred.rawId)
  const prfBytes = prfFirst(cred) ?? (await evaluatePrf(credentialId))
  const wrapped = await wrapIdentity(id, prfBytes)

  return {
    protected: true,
    v: 1,
    name: id.name,
    pub: id.pub,
    credentialId: bytesToB64url(credentialId),
    wrapped
  }
}

/**
 * Replay the passkey to re-derive the PRF output and decrypt the stored
 * identity into memory (FR-15). A wrong/absent device yields a different KEK, so
 * the AES-GCM tag fails inside unwrapIdentity - it never partially reveals.
 */
export async function unlockWithDevice(stored: StoredProtected): Promise<Identity> {
  const prfBytes = await evaluatePrf(b64urlToBytes(stored.credentialId))
  return unwrapIdentity(stored.wrapped, prfBytes)
}

async function evaluatePrf(credentialId: Uint8Array): Promise<Uint8Array> {
  const salt = await prfSalt()
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: ab(randomBytes(32)),
      rpId: window.location.hostname,
      allowCredentials: [{ type: 'public-key', id: ab(credentialId) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: ab(salt) } } } as unknown as PrfEval,
      timeout: 60_000
    }
  })) as PublicKeyCredential | null

  if (!assertion) throw new DeviceError('Device unlock was cancelled.')
  const prf = prfFirst(assertion)
  if (!prf) throw new DeviceError('No PRF output returned by the authenticator.')
  return prf
}
