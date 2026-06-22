// Drives the secret scan for the share flow (PRD-06 FR-10). Runs the scan in a
// Web Worker so the dialog paints and stays responsive on large sessions, with
// live progress; closing the dialog terminates the worker (cancellation). Falls
// back to a deferred main-thread scan where workers aren't available.

import type { Session } from '@claudepad/schema'
import { scanSession, type Detection, type ScanSettings } from '@claudepad/secrets'
import * as React from 'react'
import type { ScanRequest, ScanResponse } from './scanProtocol'

export interface ScanProgress {
  scanning: boolean
  /** 0..1 once the worker reports counts; null while unknown (e.g. fallback). */
  progress: number | null
  detections: Detection[]
  error: string | null
}

const supportsWorker = typeof Worker !== 'undefined'

/**
 * Scan `session` while `enabled`; resets and re-scans when the session or
 * `settings` change (e.g. a sensitivity change in the review UI).
 */
export function useSecretScan(
  session: Session,
  enabled: boolean,
  settings?: ScanSettings
): ScanProgress {
  const [state, setState] = React.useState<ScanProgress>({
    scanning: true,
    progress: null,
    detections: [],
    error: null
  })

  React.useEffect(() => {
    if (!enabled) return
    setState({ scanning: true, progress: null, detections: [], error: null })

    if (!supportsWorker) {
      // Defer so the dialog paints before a blocking main-thread scan.
      const handle = setTimeout(() => {
        try {
          setState({
            scanning: false,
            progress: 1,
            detections: scanSession(session, settings),
            error: null
          })
        } catch (err) {
          setState({
            scanning: false,
            progress: null,
            detections: [],
            error: err instanceof Error ? err.message : 'Could not scan this session.'
          })
        }
      }, 0)
      return () => clearTimeout(handle)
    }

    const worker = new Worker(new URL('./secretScan.worker.ts', import.meta.url), {
      type: 'module'
    })
    worker.onmessage = (e: MessageEvent<ScanResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setState((s) => ({ ...s, progress: msg.total > 0 ? msg.done / msg.total : 1 }))
      } else if (msg.type === 'done') {
        setState({ scanning: false, progress: 1, detections: msg.detections, error: null })
      } else {
        setState({ scanning: false, progress: null, detections: [], error: msg.message })
      }
    }
    worker.onerror = () =>
      setState({
        scanning: false,
        progress: null,
        detections: [],
        error: 'Could not scan this session.'
      })
    worker.postMessage({ session, settings } satisfies ScanRequest)

    // Closing/reopening or unmount terminates the in-flight scan.
    return () => worker.terminate()
  }, [enabled, session, settings])

  return state
}
