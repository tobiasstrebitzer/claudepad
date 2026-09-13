// @/usage - useQuotaLog.ts
//
// Optional import of measured quota readings, so the rate-limit panel can show
// what your limits actually were instead of what claudepad guessed.
//
// Two ways in, because the two audiences differ. Connect the folder once
// (Chromium, same File System Access pattern as the vault) and every later
// visit re-reads it with no clicks; or drop the files, which works in any
// browser but goes stale. Either way the readings are parsed locally and the
// samples cached in IndexedDB - same trust domain as the vault, nothing leaves
// the browser.

import * as React from 'react'
import { createIdbKv } from '@/lib/idbKv'
import { parseQuotaLog, type QuotaSample } from './quotaLog'

/** ccstatusbar writes `usage-log.jsonl` plus dated rollovers beside it. */
const LOG_FILE_RE = /^usage-log.*\.jsonl$/i

const handles = createIdbKv('claudepad-quota-log', 'handles')
const cache = createIdbKv('claudepad-quota-log-cache', 'samples')
const DIR_KEY = 'quota-log-dir'
const SAMPLES_KEY = 'samples'

export type QuotaLogStatus = 'idle' | 'restoring' | 'reading' | 'ready' | 'needs-permission' | 'error'

export interface QuotaLogApi {
  status: QuotaLogStatus
  samples: QuotaSample[]
  /** True when a folder is connected (so readings refresh by themselves). */
  connected: boolean
  error?: string
  /** Pick the folder holding the logs. Needs a user gesture. */
  connect: () => Promise<void>
  /** Re-grant a lapsed permission on the stored folder. */
  regrant: () => Promise<void>
  /** One-off import; works without File System Access. */
  importFiles: (files: FileList | File[]) => Promise<void>
  /** Forget the folder and the cached readings. */
  disconnect: () => Promise<void>
}

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

async function readDir(dir: FileSystemDirectoryHandle): Promise<QuotaSample[]> {
  const out: QuotaSample[] = []
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !LOG_FILE_RE.test(entry.name)) continue
    const file = await (entry as FileSystemFileHandle).getFile()
    out.push(...parseQuotaLog(await file.text()))
  }
  return dedupe(out)
}

/** Rollover files overlap at the seam; one reading per timestamp is enough. */
function dedupe(samples: QuotaSample[]): QuotaSample[] {
  const by = new Map<number, QuotaSample>()
  for (const s of samples) by.set(s.ts, s)
  return [...by.values()].sort((a, b) => a.ts - b.ts)
}

async function permission(dir: FileSystemDirectoryHandle, request: boolean): Promise<PermissionState> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' }
  const current = dir.queryPermission ? await dir.queryPermission(opts) : 'granted'
  if (current === 'granted' || !request || !dir.requestPermission) return current
  return dir.requestPermission(opts)
}

export function useQuotaLog(): QuotaLogApi {
  const [status, setStatus] = React.useState<QuotaLogStatus>('restoring')
  const [samples, setSamples] = React.useState<QuotaSample[]>([])
  const [connected, setConnected] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const dirRef = React.useRef<FileSystemDirectoryHandle>(undefined)

  const store = React.useCallback(async (next: QuotaSample[]) => {
    setSamples(next)
    setStatus('ready')
    await cache.set(SAMPLES_KEY, next)
  }, [])

  React.useEffect(() => {
    let live = true
    void (async () => {
      // Show any cached readings immediately; a connected folder refreshes them.
      const cached = await cache.get<QuotaSample[]>(SAMPLES_KEY)
      if (live && cached?.length) {
        setSamples(cached)
        setStatus('ready')
      }
      const dir = await handles.get<FileSystemDirectoryHandle>(DIR_KEY)
      if (!live) return
      if (!dir) {
        setStatus(cached?.length ? 'ready' : 'idle')
        return
      }
      dirRef.current = dir
      setConnected(true)
      if ((await permission(dir, false)) !== 'granted') {
        if (live) setStatus('needs-permission')
        return
      }
      if (live) setStatus('reading')
      try {
        const fresh = await readDir(dir)
        if (live) await store(fresh)
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'Could not read the quota log.')
          setStatus(cached?.length ? 'ready' : 'error')
        }
      }
    })()
    return () => { live = false }
  }, [store])

  const connect = React.useCallback(async () => {
    if (!isFolderPickerSupported()) return
    try {
      const dir = await window.showDirectoryPicker!({ id: 'claude-quota-log', mode: 'read' })
      dirRef.current = dir
      setConnected(true)
      setStatus('reading')
      const fresh = await readDir(dir)
      await handles.set(DIR_KEY, dir)
      await store(fresh)
      setError(undefined)
    } catch (e) {
      // An aborted picker is a normal outcome, not a failure worth surfacing.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setStatus(samples.length ? 'ready' : 'idle')
        return
      }
      setError(e instanceof Error ? e.message : 'Could not read the folder.')
      setStatus('error')
    }
  }, [store, samples.length])

  const regrant = React.useCallback(async () => {
    const dir = dirRef.current
    if (!dir) return
    if ((await permission(dir, true)) !== 'granted') return
    setStatus('reading')
    await store(await readDir(dir))
  }, [store])

  const importFiles = React.useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setStatus('reading')
    const out: QuotaSample[] = []
    for (const f of list) {
      try { out.push(...parseQuotaLog(await f.text())) } catch { /* skip unreadable file */ }
    }
    await store(dedupe([...samples, ...out]))
  }, [samples, store])

  const disconnect = React.useCallback(async () => {
    dirRef.current = undefined
    setConnected(false)
    setSamples([])
    setStatus('idle')
    await handles.delete(DIR_KEY)
    await cache.delete(SAMPLES_KEY)
  }, [])

  return {
    status,
    samples,
    connected,
    ...(error ? { error } : {}),
    connect,
    regrant,
    importFiles,
    disconnect
  }
}
