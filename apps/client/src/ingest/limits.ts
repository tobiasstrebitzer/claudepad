import type { SizeCaps, SizeVerdict } from './types'

// File-size policy (PRD-04 FR-16). Above the soft cap the UI warns (and offers to
// continue); above the hard cap it refuses with guidance to trim/split.
export const DEFAULT_CAPS: SizeCaps = {
  soft: 25 * 1024 * 1024, // 25 MB
  hard: 100 * 1024 * 1024 // 100 MB
}

/** Streaming threshold (FR-17): read files larger than this as a stream. */
export const STREAMING_THRESHOLD = 2 * 1024 * 1024 // 2 MB

export function checkSize(bytes: number, caps: SizeCaps = DEFAULT_CAPS): SizeVerdict {
  return {
    bytes,
    overSoftCap: bytes > caps.soft,
    overHardCap: bytes > caps.hard
  }
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
