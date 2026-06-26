// @/usage - protocol.ts
//
// Message contract between the Usage Insights host and its compute worker
// (PRD-13 FR-16). Only *stale* files (new or changed since the cache) are sent;
// the worker reads, parses, and aggregates each off the main thread and streams
// back one FileAggregate per file plus progress.

import type { FileAggregate } from './types'

/** One session file to (re)compute. `fileId` is stable: `${projectId}/${fileName}`. */
export interface UsageFileTask {
  fileId: string
  handle: FileSystemFileHandle
  size: number
  lastModified: number
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
