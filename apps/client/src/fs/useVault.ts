import * as React from 'react'
import {
  isVaultSupported,
  pickProjectsRoot,
  scanVault,
  verifyPermission,
  type VaultProject
} from './vault'
import { clearRootHandle, loadRootHandle, saveRootHandle } from './handleStore'

// Lifecycle of the folder connection:
//   unsupported  – not a Chromium browser; folder browsing is unavailable
//   restoring    – checking a previously-stored handle on mount (no prompt)
//   idle         – supported, nothing connected yet
//   needs-permission – a handle exists but the grant lapsed; one click re-grants
//   connecting   – picker open and/or scanning
//   connected    – projects loaded
//   error        – something went wrong
export type VaultStatus =
  | 'unsupported'
  | 'restoring'
  | 'idle'
  | 'needs-permission'
  | 'connecting'
  | 'connected'
  | 'error'

export interface Vault {
  status: VaultStatus
  supported: boolean
  projects: VaultProject[]
  error?: string
  /**
   * Increments after each *user-initiated* connect/reconnect scan (never on the
   * silent restore). Lets the app auto-open the most recent session on connect
   * without hijacking every page load.
   */
  userConnectEpoch: number
  /** Open the picker and connect (requires a user gesture). */
  connect: () => Promise<void>
  /** Re-grant a lapsed permission on the stored handle (requires a gesture). */
  reconnect: () => Promise<void>
  /** Re-scan the connected folder for new/changed sessions. */
  refresh: () => Promise<void>
  /** Forget the stored handle. */
  disconnect: () => Promise<void>
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Could not read the folder.'
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function useVault(): Vault {
  const supported = React.useMemo(isVaultSupported, [])
  const [status, setStatus] = React.useState<VaultStatus>(
    supported ? 'restoring' : 'unsupported'
  )
  const [projects, setProjects] = React.useState<VaultProject[]>([])
  const [error, setError] = React.useState<string | undefined>()
  const [userConnectEpoch, setUserConnectEpoch] = React.useState(0)
  const rootRef = React.useRef<FileSystemDirectoryHandle | null>(null)

  const scanInto = React.useCallback(async (root: FileSystemDirectoryHandle) => {
    setStatus('connecting')
    const found = await scanVault(root)
    rootRef.current = root
    setProjects(found)
    setStatus('connected')
  }, [])

  // On mount, try to silently restore a prior connection. queryPermission needs
  // no gesture; it returns 'granted' only if the browser kept a persistent grant
  // ("allow on every visit"), otherwise we fall back to a one-click reconnect.
  React.useEffect(() => {
    if (!supported) return
    let cancelled = false
    void (async () => {
      try {
        const handle = await loadRootHandle()
        if (cancelled) return
        if (!handle) {
          setStatus('idle')
          return
        }
        rootRef.current = handle
        const perm = await verifyPermission(handle, false)
        if (cancelled) return
        if (perm === 'granted') await scanInto(handle)
        else setStatus('needs-permission')
      } catch (err) {
        if (cancelled) return
        setError(errMessage(err))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supported, scanInto])

  const connect = React.useCallback(async () => {
    setError(undefined)
    try {
      const root = await pickProjectsRoot()
      const perm = await verifyPermission(root, true)
      rootRef.current = root
      if (perm !== 'granted') {
        setStatus('needs-permission')
        return
      }
      await saveRootHandle(root)
      await scanInto(root)
      setUserConnectEpoch((e) => e + 1)
    } catch (err) {
      if (isAbort(err)) return // user dismissed the picker
      setError(errMessage(err))
      setStatus('error')
    }
  }, [scanInto])

  const reconnect = React.useCallback(async () => {
    const root = rootRef.current
    if (!root) return connect()
    setError(undefined)
    try {
      const perm = await verifyPermission(root, true)
      if (perm !== 'granted') {
        setStatus('needs-permission')
        return
      }
      await saveRootHandle(root)
      await scanInto(root)
      setUserConnectEpoch((e) => e + 1)
    } catch (err) {
      if (isAbort(err)) return
      setError(errMessage(err))
      setStatus('error')
    }
  }, [connect, scanInto])

  const refresh = React.useCallback(async () => {
    const root = rootRef.current
    if (!root) return
    try {
      await scanInto(root)
    } catch (err) {
      setError(errMessage(err))
      setStatus('error')
    }
  }, [scanInto])

  const disconnect = React.useCallback(async () => {
    await clearRootHandle().catch(() => undefined)
    rootRef.current = null
    setProjects([])
    setError(undefined)
    setStatus('idle')
  }, [])

  return {
    status,
    supported,
    projects,
    error,
    userConnectEpoch,
    connect,
    reconnect,
    refresh,
    disconnect
  }
}
