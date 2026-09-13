// Usage Insights compute worker (PRD-13 FR-16): parses + aggregates session
// files off the main thread so a large vault never blocks the UI. Reads each
// FileSystemFileHandle (Chromium structured-clones handles across postMessage),
// drops the raw record copy to keep memory bounded, and streams one
// FileAggregate per file back with progress. The host caches the result by
// (fileId, size, lastModified) and only sends stale files here.

import { parseSession } from '@/schema'
import { aggregateFile } from './aggregate'
import type { UsageFileTask, UsageResponse, UsageRequest } from './protocol'
import type { AgentRunInfo } from './types'

const post = (msg: UsageResponse) => self.postMessage(msg)

/**
 * Enrich a delegated run's identity from its `.meta.json` sidecar (agent type,
 * task description, spawn depth). Best-effort: a missing or malformed sidecar
 * still yields a run that counts, just without a type label.
 */
async function readAgentInfo(task: UsageFileTask): Promise<AgentRunInfo | undefined> {
  if (!task.agent) return undefined
  if (!task.metaHandle) return task.agent
  try {
    const raw: unknown = JSON.parse(await (await task.metaHandle.getFile()).text())
    if (typeof raw !== 'object' || raw === null) return task.agent
    const m = raw as Record<string, unknown>
    const info: AgentRunInfo = { ...task.agent }
    if (typeof m['agentType'] === 'string') info.agentType = m['agentType']
    if (typeof m['description'] === 'string') info.description = m['description']
    if (typeof m['spawnDepth'] === 'number') info.spawnDepth = m['spawnDepth']
    return info
  } catch {
    return task.agent
  }
}

self.onmessage = async (e: MessageEvent<UsageRequest>) => {
  const { tasks } = e.data
  const total = tasks.length
  let done = 0
  try {
    for (const task of tasks) {
      try {
        const file = await task.handle.getFile()
        const [{ session }, agent] = await Promise.all([
          parseSession(file, { preserveRaw: false }),
          readAgentInfo(task)
        ])
        post({
          type: 'file',
          fileId: task.fileId,
          size: task.size,
          lastModified: task.lastModified,
          aggregate: aggregateFile(session, agent)
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
