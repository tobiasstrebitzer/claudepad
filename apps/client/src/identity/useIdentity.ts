// The identity lifecycle as a small state machine (PRD-10 §4.1, FR-7). Three
// real states - none / locked / unlocked - plus a transient `loading` while the
// stored identity is read from IndexedDB. Everything is local: minting, import,
// export, device-protect/unlock. The private key only exists in memory while
// `unlocked` and is never logged or sent anywhere (FR-20).

import * as React from 'react'
import {
  mintIdentity,
  encodeIdentitySecret,
  decodeIdentitySecret,
  encodePublicCard,
  importPrivateKey,
  type Identity
} from '@claudepad/crypto'
import {
  indexedDbStorage,
  type IdentityStorage,
  type StoredIdentity
} from './storage'
import { deviceProtectionAvailable, protectWithDevice, unlockWithDevice } from './device'

const PUB_PREFIX = 'cp-pub-'
const ID_PREFIX = 'cp-id-'

export type IdentityState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'locked'; name: string; pub: string }
  | { status: 'unlocked'; identity: Identity; protected: boolean }

export interface IdentityApi {
  state: IdentityState
  /** True when device protection (WebAuthn PRF on a real origin) can be offered. */
  deviceAvailable: boolean
  mint(name: string): Promise<void>
  /** Adopt a pasted `cp-id-…` secret. Throws a friendly Error on bad input. */
  importSecret(input: string): Promise<void>
  /** The `cp-pub-…` card to give to others (only meaningful when unlocked). */
  publicCard(): string | null
  /** The `cp-id-…` secret to back up (only available when unlocked). */
  exportSecret(): string | null
  /** Protected → re-lock; unprotected → remove from this browser. */
  signOut(): Promise<void>
  /** Remove the stored identity entirely (recovery then needs the export). */
  forget(): Promise<void>
  /** Device-protect the unlocked identity (single passkey ceremony). */
  protect(): Promise<void>
  /** Re-derive the device KEK and decrypt a locked identity into memory. */
  unlock(): Promise<void>
  /** Drop device protection, re-storing the identity unprotected. */
  removeProtection(): Promise<void>
}

function initialFromStored(stored: StoredIdentity | undefined): IdentityState {
  if (!stored) return { status: 'none' }
  if (stored.protected) {
    return { status: 'locked', name: stored.name, pub: stored.pub }
  }
  const { protected: _omit, ...identity } = stored
  return { status: 'unlocked', identity, protected: false }
}

export function useIdentity(storage: IdentityStorage = indexedDbStorage): IdentityApi {
  const [state, setState] = React.useState<IdentityState>({ status: 'loading' })
  const deviceAvailable = React.useMemo(() => deviceProtectionAvailable(), [])

  React.useEffect(() => {
    let live = true
    void storage
      .load()
      .then((stored) => live && setState(initialFromStored(stored)))
      .catch(() => live && setState({ status: 'none' }))
    return () => {
      live = false
    }
  }, [storage])

  const adopt = React.useCallback(
    async (identity: Identity) => {
      await storage.save({ protected: false, ...identity })
      setState({ status: 'unlocked', identity, protected: false })
    },
    [storage]
  )

  const mint = React.useCallback(
    async (name: string) => {
      await adopt(await mintIdentity(name.trim() || 'anon'))
    },
    [adopt]
  )

  const importSecret = React.useCallback(
    async (input: string) => {
      const raw = input.trim()
      const body = raw.startsWith(ID_PREFIX) ? raw.slice(ID_PREFIX.length) : raw
      const identity = decodeIdentitySecret(body) // throws typed errors on bad input
      await importPrivateKey(identity) // validate the key actually imports (FR-4)
      await adopt(identity)
    },
    [adopt]
  )

  const publicCard = React.useCallback((): string | null => {
    if (state.status !== 'unlocked') return null
    return PUB_PREFIX + encodePublicCard(state.identity)
  }, [state])

  const exportSecret = React.useCallback((): string | null => {
    if (state.status !== 'unlocked') return null
    return ID_PREFIX + encodeIdentitySecret(state.identity)
  }, [state])

  const forget = React.useCallback(async () => {
    await storage.clear()
    setState({ status: 'none' })
  }, [storage])

  const signOut = React.useCallback(async () => {
    if (state.status !== 'unlocked') return
    // Protected: just re-lock (the wrapped secret stays in storage, FR-8). We
    // re-read it so the locked panel reflects exactly what's at rest.
    if (state.protected) {
      const stored = await storage.load()
      setState(
        stored?.protected
          ? { status: 'locked', name: stored.name, pub: stored.pub }
          : { status: 'none' }
      )
      return
    }
    // Unprotected: nothing to lock to - remove it (the UI confirms + reminds to
    // export first, FR-8/FR-9).
    await forget()
  }, [state, storage, forget])

  const protect = React.useCallback(async () => {
    if (state.status !== 'unlocked') return
    const stored = await protectWithDevice(state.identity) // single passkey ceremony
    await storage.save(stored)
    setState({ status: 'unlocked', identity: state.identity, protected: true })
  }, [state, storage])

  const unlock = React.useCallback(async () => {
    const stored = await storage.load()
    if (!stored?.protected) return
    const identity = await unlockWithDevice(stored) // fails closed on wrong device
    setState({ status: 'unlocked', identity, protected: true })
  }, [storage])

  const removeProtection = React.useCallback(async () => {
    if (state.status !== 'unlocked') return
    await storage.save({ protected: false, ...state.identity })
    setState({ status: 'unlocked', identity: state.identity, protected: false })
  }, [state, storage])

  return {
    state,
    deviceAvailable,
    mint,
    importSecret,
    publicCard,
    exportSecret,
    signOut,
    forget,
    protect,
    unlock,
    removeProtection
  }
}
