// Secret-scan Web Worker (PRD-06 FR-10): runs the pure scanner off the main
// thread so the share dialog stays responsive on large sessions, posting
// progress as it goes. The host cancels by terminating the worker.

import { scanSession } from '@/secrets'
import type { ScanRequest, ScanResponse } from './scanProtocol'

const post = (msg: ScanResponse) => self.postMessage(msg)

self.onmessage = (e: MessageEvent<ScanRequest>) => {
  const { session, settings } = e.data
  try {
    const detections = scanSession(session, settings, {
      onProgress: (done, total) => post({ type: 'progress', done, total })
    })
    post({ type: 'done', detections })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'scan failed' })
  }
}
