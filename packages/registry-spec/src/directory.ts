/**
 * Authenticity axis - the identity directory (REGISTRY-SPEC.md §5).
 *
 * A directory maps a human-resolvable handle to a public-key card plus an
 * assurance level describing HOW the registry verified that binding. Trust in
 * a `domain`/`sso` entry is trust in the registry; `self` vouches for nothing,
 * so the out-of-band fingerprint check stays mandatory (the v1 model).
 */

/** How strongly the registry vouches for a handle <-> public-key binding. */
export type AssuranceLevel =
  /** Self-asserted: anyone published this card. The registry is a cache. */
  | 'self'
  /** Registry verified control of an email domain / DNS. */
  | 'domain'
  /** Registry authenticated the person via an identity provider (OIDC/SAML). */
  | 'sso'

export interface DirectoryEntry {
  /** Registry-scoped, e.g. "dana@acme". */
  handle: string
  /** Self-claimed display name (asserts nothing on its own). */
  name: string
  /** cp-pub-… public-key card (public key only; never a private key). */
  pub: string
  /** SHA-256(rawPub) emoji+hex fingerprint. The client may recompute it from `pub`. */
  fingerprint: string
  assurance: AssuranceLevel
  /** e.g. "acme.com" for domain/sso entries; absent for `self`. */
  verifiedBy?: string
}

/** Whether a level lets the client skip the manual out-of-band fingerprint dance. */
export function isVerifiedAssurance(level: AssuranceLevel): boolean {
  return level === 'domain' || level === 'sso'
}
