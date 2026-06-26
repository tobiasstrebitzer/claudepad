// Optional registry connection (registry-spec.md), opt-in and null by default.
// Holds the configured URL (persisted, https-only), connects via the SDK, and
// exposes the connected provider + manifest. The auth token for authenticated
// routes is our own pubHash, read live so identity changes don't reconnect.

import {
  isAllowedRegistryUrl,
  RegistryClient,
  type RegistryManifest
} from '@claudepad/registry-client'
import * as React from 'react'
import { useIdentityContext } from '../identity'
import { usePersistedState } from '../lib/usePersistedState'
import { pubHash } from './pubHash'

const STORAGE_KEY = 'claudepad.registry-url'

export type RegistryState =
  | { status: 'none' }
  | { status: 'connecting'; url: string }
  | { status: 'connected'; url: string; client: RegistryClient; manifest: RegistryManifest }
  | { status: 'error'; url: string; message: string }

export interface RegistryApi {
  /** The configured URL (empty when no registry). */
  url: string
  state: RegistryState
  /** The connected client, or null unless status === 'connected'. */
  client: RegistryClient | null
  /** Point at a registry (or '' to disconnect). Persisted. */
  configure: (url: string) => void
  disconnect: () => void
}

const RegistryContext = React.createContext<RegistryApi | null>(null)

export function useRegistry(): RegistryApi {
  const ctx = React.useContext(RegistryContext)
  if (!ctx) throw new Error('useRegistry must be used within a RegistryProvider')
  return ctx
}

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = usePersistedState<string>(STORAGE_KEY, '')
  const [state, setState] = React.useState<RegistryState>({ status: 'none' })
  const { state: idState } = useIdentityContext()

  // Read the current identity lazily so the token stays fresh without forcing a
  // reconnect when the user mints/unlocks after connecting.
  const identityRef = React.useRef(idState)
  identityRef.current = idState
  const getAuthToken = React.useCallback(async (): Promise<string | null> => {
    const s = identityRef.current
    if (s.status === 'unlocked') return pubHash(s.identity.pub)
    if (s.status === 'locked') return pubHash(s.pub)
    return null
  }, [])

  React.useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed) {
      setState({ status: 'none' })
      return
    }
    if (!isAllowedRegistryUrl(trimmed)) {
      setState({
        status: 'error',
        url: trimmed,
        message: 'Registry URL must be https:// (or http://localhost for dev).'
      })
      return
    }
    let live = true
    setState({ status: 'connecting', url: trimmed })
    RegistryClient.connect(trimmed, { getAuthToken })
      .then((client) => {
        if (live) setState({ status: 'connected', url: trimmed, client, manifest: client.manifest })
      })
      .catch((e: unknown) => {
        if (live) {
          setState({
            status: 'error',
            url: trimmed,
            message: e instanceof Error ? e.message : 'Could not reach that registry.'
          })
        }
      })
    return () => {
      live = false
    }
  }, [url, getAuthToken])

  const api = React.useMemo<RegistryApi>(
    () => ({
      url,
      state,
      client: state.status === 'connected' ? state.client : null,
      configure: (next: string) => setUrl(next.trim()),
      disconnect: () => setUrl('')
    }),
    [url, state, setUrl]
  )

  return <RegistryContext.Provider value={api}>{children}</RegistryContext.Provider>
}
