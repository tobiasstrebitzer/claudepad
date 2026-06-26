// Usage Insights compute worker (PRD-13 FR-16): parses + aggregates session
// files off the main thread so a large vault never blocks the UI. Reads each
// FileSystemFileHandle (Chromium structured-clones handles across postMessage),
// drops the raw record copy to keep memory bounded, and streams one
// FileAggregate per file back with progress. The host caches the result by
// (fileId, size, lastModified) and only sends stale files here.

import { parseSession } from '@/schema'
import { aggregateFile } from './aggregate'
import type { UsageRequest, UsageResponse } from './protocol'

const post = (msg: UsageResponse) => self.postMessage(msg)

self.onmessage = async (e: MessageEvent<UsageRequest>) => {
  const { tasks } = e.data
  const total = tasks.length
  let done = 0
  try {
    for (const task of tasks) {
      try {
        const file = await task.handle.getFile()
        const { session } = await parseSession(file, { preserveRaw: false })
        post({
          type: 'file',
          fileId: task.fileId,
          size: task.size,
          lastModified: task.lastModified,
          aggregate: aggregateFile(session)
        })
      } catch (err) {
        // One unreadable file shouldn't sink the whole vault - report and skip.
        post({ type: 'error', fileId: task.fileId, message: errText(err) })
      }
      post({ type: 'progress', done: ++done, total })
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', message: errText(err) })
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : 'compute failed'
}
