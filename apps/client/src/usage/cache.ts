// @/usage - cache.ts
//
// Per-file aggregate cache (PRD-13 FR-16) so re-opening Usage Insights only
// reparses changed/new sessions. Keyed by `(fileId, size, lastModified)`:
// Claude Code JSONL is append-only, so both size and lastModified advance on
// every write - the key changes iff the file changed (OQ-5). Stored locally via
// idbKv, same trust domain as the vault handle and identity stores.

import { createIdbKv } from '@/lib/idbKv'
import type { FileAggregate } from './types'

export interface CachedFile {
  size: number
  lastModified: number
  aggregate: FileAggregate
}

// One database per store (the idbKv helper creates a single store on first
// open); a sibling DB holds settings (see useUsageSettings). The store name
// carries a schema version: `v2` switched FileAggregate from pre-summed day
// buckets to a deduped per-turn record list, so old entries must not be read
// back - a fresh store name orphans them.
const kv = createIdbKv('claudepad-usage-cache', 'file-aggregates-v2')

export function loadCachedFile(fileId: string): Promise<CachedFile | undefined> {
  return kv.get<CachedFile>(fileId)
}

export function storeCachedFile(fileId: string, entry: CachedFile): Promise<void> {
  return kv.set(fileId, entry)
}

/** A cached entry is valid only when size AND lastModified both still match. */
export function isFresh(cached: CachedFile | undefined, size: number, lastModified: number): boolean {
  return cached?.size === size && cached.lastModified === lastModified
}
