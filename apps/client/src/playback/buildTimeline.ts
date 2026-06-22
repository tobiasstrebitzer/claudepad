// The playback engine (PRD-08 §6.1). `buildTimeline` is a pure function -
// (Session × Mode × PacingConfig) → Timeline - and the high-value unit-test
// target. It builds the timeline over the viewer's render rows (correlated
// tool_use↔tool_result) so the active/revealed sets align 1:1 with what the
// renderer mounts; no render fork (FR-14). Changing only the playhead never
// rebuilds the timeline (FR-20) - resolveFrame is a pure O(log n) derivation.

import type { Session } from '@/schema'
import { correlateTools, type RenderRow } from '../viewer/hooks/useCorrelateTools'
import {
  filterRows,
  ALL_VISIBLE,
  type EventVisibility
} from '../viewer/hooks/eventFilter'
import {
  DEFAULT_PACING,
  dwellPresentMs,
  spamDwellMs,
  clamp,
  type PacingConfig
} from './pacing'

export type PlaybackMode = 'realtime' | 'present'

/** Tick/segment kind - drives scrubber tick colour and surface affordances. */
export type SegKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'meta' | 'idle'

export interface Segment {
  /** virtual time, ms */
  startMs: number
  dwellMs: number
  /** inclusive first render-row index covered (== rowEnd for idle markers). */
  rowStart: number
  /** exclusive last render-row index. */
  rowEnd: number
  kind: SegKind
  /** folded tool-spam run (FR-12). */
  folded?: boolean
  foldCount?: number
  foldName?: string
  /** collapsed idle-gap beat (FR-11); covers no rows. */
  idleMarker?: boolean
  /** original (real-time) idle gap in seconds, for the scrubber tooltip. */
  idleSeconds?: number
}

export interface Timeline {
  segs: Segment[]
  totalMs: number
  /** render-row index → segment index (jump-to-event, FR-8). */
  rowToSeg: number[]
  rowCount: number
  mode: PlaybackMode
}

/** Derived, pure-from-playhead view of the timeline (FR-4). */
export interface PlaybackFrame {
  /** number of leading render rows revealed (start ≤ playhead). */
  revealedCount: number
  /** the single active render-row index, or -1 before the first row. */
  activeRowIndex: number
  /** active segment index, or -1 for an empty timeline. */
  segIndex: number
  /** playhead / total, in [0,1]. */
  fraction: number
  /** active segment's virtual start (ms) - for the typing reveal clock. */
  activeSegStartMs: number
  /** active segment's dwell (ms) - for the typing reveal clock. */
  activeSegDwellMs: number
}

function rowKind(row: RenderRow): SegKind {
  if (row.kind === 'tool' || row.kind === 'orphan-result') return 'tool'
  switch (row.event.kind) {
    case 'user':
      return 'user'
    case 'assistant':
      return 'assistant'
    case 'thinking':
      return 'thinking'
    default:
      return 'meta'
  }
}

const tsMs = (iso?: string): number => (iso ? Date.parse(iso) : NaN)

/** Real-time gap (ms) preceding `row`, measured from `prev`'s last timestamp. */
function realtimeGapMs(prev: RenderRow | null, row: RenderRow): number {
  if (!prev) return NaN
  const prevEnd =
    prev.kind === 'tool' && prev.result ? tsMs(prev.result.ts) : tsMs(prev.event.ts)
  const cur = tsMs(row.event.ts)
  if (!Number.isFinite(prevEnd) || !Number.isFinite(cur)) return NaN
  return cur - prevEnd
}

function toolName(row: RenderRow): string | null {
  return row.kind === 'tool' ? row.event.name : null
}

/**
 * Build the playback timeline. Pure: same (session, mode, cfg) ⇒ same timeline.
 * In present mode, idle gaps collapse to a marked beat and runs of same-name
 * tool rows fold into one sublinear beat; real-time mode preserves clamped gaps.
 */
export function buildTimeline(
  session: Session,
  mode: PlaybackMode = 'present',
  cfg: PacingConfig = DEFAULT_PACING,
  visibility: EventVisibility = ALL_VISIBLE
): Timeline {
  // Filtered-out groups are ignored entirely - the timeline never paces or
  // reveals them - and the viewer applies the same filter, so indices align.
  const rows = filterRows(correlateTools(session.events), visibility)
  const segs: Segment[] = []
  const rowToSeg = new Array<number>(rows.length).fill(-1)
  let t = 0
  let i = 0
  let prev: RenderRow | null = null

  const pushIdleBefore = (row: RenderRow, rowIndex: number) => {
    if (mode !== 'present') return
    const gap = realtimeGapMs(prev, row)
    if (Number.isFinite(gap) && gap > cfg.idleThreshold * 1000) {
      const dwellMs = Math.round(cfg.idleCollapsed * 1000)
      segs.push({
        startMs: t,
        dwellMs,
        rowStart: rowIndex,
        rowEnd: rowIndex,
        kind: 'idle',
        idleMarker: true,
        idleSeconds: Math.round(gap / 1000)
      })
      t += dwellMs
    }
  }

  while (i < rows.length) {
    const row = rows[i]!

    // 1) Fold a run of same-name tool rows (present mode only, FR-12).
    const name = toolName(row)
    if (mode === 'present' && name != null) {
      let k = 1
      while (i + k < rows.length && toolName(rows[i + k]!) === name) k++
      if (k >= cfg.toolSpamRun) {
        pushIdleBefore(row, i)
        const dwellMs = spamDwellMs(k, cfg)
        const segIndex =
          segs.push({
            startMs: t,
            dwellMs,
            rowStart: i,
            rowEnd: i + k,
            kind: 'tool',
            folded: true,
            foldCount: k,
            foldName: name
          }) - 1
        for (let j = i; j < i + k; j++) rowToSeg[j] = segIndex
        t += dwellMs
        prev = rows[i + k - 1]!
        i += k
        continue
      }
    }

    // 2) Idle gap preceding this row (present mode).
    pushIdleBefore(row, i)

    // 3) Per-row dwell.
    let dwellMs: number
    const kind = rowKind(row)
    if (mode === 'present') {
      dwellMs = dwellPresentMs(row, cfg)
      // Fast-track de-emphasised kinds (e.g. collapsed thinking) - no long waits.
      if (cfg.fastTrackKinds.includes(kind)) {
        dwellMs = Math.min(dwellMs, Math.round(cfg.fastTrackMaxDwell * 1000))
      }
    } else {
      const gap = realtimeGapMs(prev, row)
      dwellMs =
        Number.isFinite(gap) && gap > 0
          ? clamp(gap, cfg.minDwell * 1000, cfg.maxRealtimeGap * 1000)
          : dwellPresentMs(row, cfg)
    }

    const segIndex =
      segs.push({ startMs: t, dwellMs, rowStart: i, rowEnd: i + 1, kind }) - 1
    rowToSeg[i] = segIndex
    t += dwellMs
    prev = row
    i += 1
  }

  return { segs, totalMs: t, rowToSeg, rowCount: rows.length, mode }
}

/** Index of the last segment whose start ≤ playhead (binary search, FR-4). */
export function segIndexAt(timeline: Timeline, playheadMs: number): number {
  const { segs, totalMs } = timeline
  if (segs.length === 0) return -1
  const ph = clamp(playheadMs, 0, totalMs)
  let lo = 0
  let hi = segs.length - 1
  let found = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid]!.startMs <= ph) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Resolve the revealed/active sets for a playhead - pure, allocation-light. */
export function resolveFrame(timeline: Timeline, playheadMs: number): PlaybackFrame {
  const { segs, totalMs } = timeline
  if (segs.length === 0) {
    return {
      revealedCount: 0,
      activeRowIndex: -1,
      segIndex: -1,
      fraction: 0,
      activeSegStartMs: 0,
      activeSegDwellMs: 0
    }
  }
  const ph = clamp(playheadMs, 0, totalMs)
  const segIndex = segIndexAt(timeline, ph)
  const seg = segs[segIndex]!
  // A real segment reveals its rows the instant the playhead enters it; an idle
  // marker reveals nothing new and keeps the preceding row active.
  const revealedCount = seg.rowEnd
  const activeRowIndex = seg.rowEnd > seg.rowStart ? seg.rowEnd - 1 : seg.rowStart - 1
  return {
    revealedCount,
    activeRowIndex: Math.max(-1, activeRowIndex),
    segIndex,
    fraction: totalMs > 0 ? ph / totalMs : 0,
    activeSegStartMs: seg.startMs,
    activeSegDwellMs: seg.dwellMs
  }
}

/** Playhead (ms) for the start of the segment owning `rowIndex` (FR-8). */
export function rowStartMs(timeline: Timeline, rowIndex: number): number {
  const segIndex = timeline.rowToSeg[rowIndex]
  if (segIndex == null || segIndex < 0) return 0
  return timeline.segs[segIndex]!.startMs
}

/**
 * Playhead (ms) for stepping prev/next *event* segment from the current
 * playhead (FR-8). Idle markers are skipped - stepping lands on real rows.
 */
export function stepTargetMs(timeline: Timeline, playheadMs: number, dir: -1 | 1): number {
  const { segs, totalMs } = timeline
  if (segs.length === 0) return 0
  const cur = segIndexAt(timeline, playheadMs)
  let next = cur + dir
  while (next >= 0 && next < segs.length && segs[next]!.idleMarker) next += dir
  if (next < 0) return 0
  if (next >= segs.length) return totalMs
  return segs[next]!.startMs
}
