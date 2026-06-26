// @/usage - useVaultUsage.ts
//
// Orchestrates the FR-16 compute: from the connected vault's session files,
// reuse cached per-file aggregates where (size,lastModified) still match and
// send only the stale files to the worker; store fresh results back to the
// cache; roll everything up into a VaultUsage with live progress. Re-runs only
// when the file set actually changes (signature-keyed).

import * as React from 'react'
import { parseSession } from '@/schema'
import type { VaultProject } from '@/fs/vault'
import { aggregateFile, rollupVault } from './aggregate'
import { isFresh, loadCachedFile, storeCachedFile } from './cache'
import type { UsageRequest, UsageResponse } from './protocol'
import type { FileAggregate, VaultUsage } from './types'

export interface UsageComputeState {
  status: 'idle' | 'computing' | 'ready' | 'error'
  /** 0..1 over all files (cached + freshly parsed). */
  progress: number
  vault?: VaultUsage
  /** Per-file aggregates, for cheap re-rolls under project/date filters. */
  files?: FileAggregate[]
  error?: string
}

interface FileEntry {
  fileId: string
  handle: FileSystemFileHandle
  size: number
  lastModified: number
}

const supportsWorker = typeof Worker !== 'undefined'

function collectFiles(projects: VaultProject[]): FileEntry[] {
  const out: FileEntry[] = []
  for (const p of projects) {
    for (const s of p.sessions) {
      out.push({
        fileId: `${p.id}/${s.fileName}`,
        handle: s.handle,
        size: s.size,
        lastModified: s.lastModified
      })
    }
  }
  return out
}

/** Stable signature: recompute only when a file is added/removed/changed. */
function signatureOf(files: FileEntry[]): string {
  return files
    .map((f) => `${f.fileId}:${f.size}:${f.lastModified}`)
    .sort()
    .join('|')
}

export function useVaultUsage(projects: VaultProject[], enabled: boolean): UsageComputeState {
  const [state, setState] = React.useState<UsageComputeState>({ status: 'idle', progress: 0 })
  const files = React.useMemo(() => collectFiles(projects), [projects])
  const signature = React.useMemo(() => signatureOf(files), [files])

  React.useEffect(() => {
    if (!enabled) return
    if (files.length === 0) {
      setState({ status: 'ready', progress: 1, vault: rollupVault([]), files: [] })
      return
    }

    let cancelled = false
    let worker: Worker | undefined
    setState({ status: 'computing', progress: 0 })

    void (async () => {
      const aggregates = new Map<string, FileAggregate>()
      const stale: FileEntry[] = []

      // Partition into cache hits and stale files.
      await Promise.all(
        files.map(async (f) => {
          const cached = await loadCachedFile(f.fileId)
          if (isFresh(cached, f.size, f.lastModified)) {
            aggregates.set(f.fileId, cached!.aggregate)
          } else {
            stale.push(f)
          }
        })
      )
      if (cancelled) return

      const total = files.length
      const report = () => {
        if (!cancelled) {
          setState({ status: 'computing', progress: total > 0 ? aggregates.size / total : 1 })
        }
      }
      report()

      const finish = () => {
        if (cancelled) return
        const list = [...aggregates.values()]
        setState({
          status: 'ready',
          progress: 1,
          vault: { ...rollupVault(list), computedAt: new Date().toISOString() },
          files: list
        })
      }

      if (stale.length === 0) {
        finish()
        return
      }

      if (!supportsWorker) {
        // Degraded path: parse on the main thread (one yield per file).
        for (const f of stale) {
          if (cancelled) return
          try {
            const file = await f.handle.getFile()
            const { session } = await parseSession(file, { preserveRaw: false })
            const aggregate = aggregateFile(session)
            aggregates.set(f.fileId, aggregate)
            void storeCachedFile(f.fileId, { size: f.size, lastModified: f.lastModified, aggregate })
          } catch {
            // skip unreadable file
          }
          report()
        }
        finish()
        return
      }

      worker = new Worker(new URL('./usage.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<UsageResponse>) => {
        const msg = e.data
        if (msg.type === 'file') {
          aggregates.set(msg.fileId, msg.aggregate)
          void storeCachedFile(msg.fileId, {
            size: msg.size,
            lastModified: msg.lastModified,
            aggregate: msg.aggregate
          })
          report()
        } else if (msg.type === 'done') {
          finish()
        } else if (msg.type === 'error' && !msg.fileId) {
          if (!cancelled) setState({ status: 'error', progress: 0, error: msg.message })
        }
        // Per-file errors (msg.fileId set) are skipped silently - one bad file
        // shouldn't fail the whole vault.
      }
      worker.onerror = () => {
        if (!cancelled) setState({ status: 'error', progress: 0, error: 'Could not compute usage.' })
      }
      worker.postMessage({ type: 'compute', tasks: stale } satisfies UsageRequest)
    })()

    return () => {
      cancelled = true
      worker?.terminate()
    }

  }, [signature, enabled])

  return state
}
