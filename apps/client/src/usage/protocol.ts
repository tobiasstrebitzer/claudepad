// @/usage - protocol.ts
//
// Message contract between the Usage Insights host and its compute worker
// (PRD-13 FR-16). Only *stale* files (new or changed since the cache) are sent;
// the worker reads, parses, and aggregates each off the main thread and streams
// back one FileAggregate per file plus progress.

import type { AgentRunInfo, FileAggregate } from './types'

/** One session file to (re)compute. `fileId` is stable: `${projectId}/${fileName}`. */
export interface UsageFileTask {
  fileId: string
  handle: FileSystemFileHandle
  size: number
  lastModified: number
  /**
   * Set when the task is a delegated subagent run rather than a top-level
   * session. `agentType`/`description` come from the run's `.meta.json` sidecar,
   * which the worker reads (it is a second tiny file per run, so it is read off
   * the main thread with the transcript, not during the vault scan).
   */
  agent?: AgentRunInfo
  /** Handle to the run's `.meta.json` sidecar, when one exists. */
  metaHandle?: FileSystemFileHandle
}

export interface UsageRequest {
  type: 'compute'
  tasks: UsageFileTask[]
}

export type UsageResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'file'; fileId: string; size: number; lastModified: number; aggregate: FileAggregate }
  | { type: 'done' }
  | { type: 'error'; fileId?: string; message: string }
