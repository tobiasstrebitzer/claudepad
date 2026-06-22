// Public surface of the client identity layer (PRD-10, P2). The crypto itself
// lives in @claudepad/shared; this package productizes it: persistence, the
// none/locked/unlocked state machine, device protection, and the trust UI.

export { IdentityProvider, useIdentityContext } from './IdentityProvider'
export { useIdentity, type IdentityApi, type IdentityState } from './useIdentity'
export { IdentityControl } from './IdentityControl'
export { IdentityPanel } from './IdentityPanel'
export { Fingerprint, useFingerprint } from './Fingerprint'
export {
  type IdentityStorage,
  type StoredIdentity,
  indexedDbStorage
} from './storage'
export { deviceProtectionAvailable } from './device'
