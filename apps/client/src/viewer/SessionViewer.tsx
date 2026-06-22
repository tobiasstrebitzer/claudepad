import type { Session } from '@/schema'
import { Inbox, PanelLeftOpen, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'
import { TYPING_BUFFER_RATIO, usePlayback } from '../playback'
import { BlockErrorBoundary } from './components/BlockErrorBoundary'
import { buildToc, TableOfContents } from './components/TableOfContents'
import { TranscriptList, type TranscriptHandle } from './components/TranscriptList'
import { RawBlock } from './components/blocks/RawBlock'
import { filterRows } from './hooks/eventFilter'
import { groupRows, revealedViewItems, type ViewItem } from './hooks/groupRows'
import { anchorIdFor, useAnchor } from './hooks/useAnchor'
import { useCorrelateTools } from './hooks/useCorrelateTools'
import { useEventFilter } from './hooks/useEventFilter'

export interface SessionViewerOptions {
  showToc?: boolean
  virtualize?: boolean
  loading?: boolean
  onAnchorChange?: (id: string) => void
}

export interface SessionViewerProps {
  session: Session
  initialAnchor?: string
  options?: SessionViewerOptions
}

/**
 * Top-level session renderer (PRD-03): TOC + virtualized transcript. Pure render
 * surface - holds no keys, does no crypto, makes no network calls. The Tooltip/
 * Reveal/Expand providers and the session title/meta now live in the app shell
 * (D-49), so the unified top bar can host the secrets/expand controls; this
 * component assumes those providers are mounted above it.
 */
export function SessionViewer({ session, initialAnchor, options }: SessionViewerProps) {
  return (
    <BlockErrorBoundary fallbackValue={session}>
      <ViewerInner session={session} initialAnchor={initialAnchor} options={options} />
    </BlockErrorBoundary>
  )
}

function ViewerInner({
  session,
  initialAnchor,
  options
}: {
  session: Session
  initialAnchor?: string
  options?: SessionViewerOptions
}) {
  const showToc = options?.showToc ?? true
  const virtualize = options?.virtualize ?? true
  const loading = options?.loading ?? false

  const baseRows = useCorrelateTools(session)
  const { visibility } = useEventFilter()
  // The same filter the playback engine applies, so reveal indices stay aligned.
  const rows = React.useMemo(() => filterRows(baseRows, visibility), [baseRows, visibility])
  const toc = React.useMemo(() => buildToc(rows), [rows])
  const { highlightId, reportAnchor } = useAnchor(initialAnchor, options?.onAnchorChange)

  // Playback (PRD-08): when the surface is active, reveal only rows up to the
  // playhead, drive the active-row highlight + scroll from the engine, and let
  // the engine own the active row (so user scrolling doesn't fight it).
  const pb = usePlayback()
  const playbackActive = pb.active
  const playbackActiveRow = pb.frame.activeRowIndex

  const transcriptRef = React.useRef<TranscriptHandle>(null)
  const [activeRowIndex, setActiveRowIndex] = React.useState<number | null>(
    rows.length ? 0 : null
  )
  const [tocOpen, setTocOpen] = React.useState(showToc)

  // Reading view folds consecutive same-tool runs ("Read ×6") and inserts idle
  // dividers. During playback the same affordances are driven by the timeline's
  // own fold/idle structure (it reveals folded runs atomically), so the revealed
  // prefix gets the same ToolRunGroup / IdleDivider without half-revealed groups.
  const items = React.useMemo<ViewItem[]>(() => {
    if (playbackActive && pb.timeline) {
      return revealedViewItems(rows, pb.timeline.segs, pb.frame.revealedCount)
    }
    return groupRows(rows)
  }, [rows, playbackActive, pb.timeline, pb.frame.revealedCount])

  // The active turn reuses PRD-03's `highlighted` ring (FR-15) by overriding the
  // anchor highlight while playing.
  const activeHighlightId =
    playbackActive && playbackActiveRow >= 0 && rows[playbackActiveRow]
      ? anchorIdFor(rows[playbackActiveRow].event, rows[playbackActiveRow].index)
      : undefined

  // Typing reveal (FR-17): only the active turn types, paced so its prose
  // finishes within the dwell minus a short end-pause. Never under reduced-motion.
  let typingRowIndex: number | undefined
  let typingFraction: number | undefined
  if (playbackActive && pb.appear === 'type' && !pb.reducedMotion && playbackActiveRow >= 0) {
    const { activeSegStartMs, activeSegDwellMs } = pb.frame
    const typeWindow = activeSegDwellMs * (1 - TYPING_BUFFER_RATIO)
    const elapsed = pb.playheadMs - activeSegStartMs
    typingRowIndex = playbackActiveRow
    typingFraction = typeWindow > 0 ? Math.min(1, Math.max(0, elapsed / typeWindow)) : 1
  }

  // Smooth-scroll the active turn into view; instant under reduced-motion or fast
  // speeds (FR-16/21).
  React.useEffect(() => {
    if (!playbackActive || playbackActiveRow < 0) return
    const behavior: ScrollBehavior =
      pb.reducedMotion || pb.speed >= 4 ? 'auto' : 'smooth'
    transcriptRef.current?.scrollToRow(playbackActiveRow, { align: 'center', behavior })
  }, [playbackActive, playbackActiveRow, pb.reducedMotion, pb.speed])

  // Deep-link: scroll the initial anchor into view on mount (FR-16).
  React.useEffect(() => {
    if (!initialAnchor) return
    const idx = toc.findIndex((e) => e.anchorId === initialAnchor)
    if (idx >= 0) {
      // Defer to let the virtualizer mount.
      const t = requestAnimationFrame(() => transcriptRef.current?.scrollToRow(idx))
      return () => cancelAnimationFrame(t)
    }
    return
  }, [initialAnchor, toc])

  const onActiveRowChange = React.useCallback(
    (rowIndex: number) => {
      setActiveRowIndex(rowIndex)
      const entry = toc[rowIndex]
      if (entry) reportAnchor(entry.anchorId)
    },
    [toc, reportAnchor]
  )

  const onJump = React.useCallback(
    (rowIndex: number) => {
      // During playback a TOC jump seeks the playhead (the engine then reveals +
      // scrolls); otherwise it's a plain scroll.
      if (playbackActive) {
        pb.seekToRow(rowIndex)
        return
      }
      transcriptRef.current?.scrollToRow(rowIndex)
      setActiveRowIndex(rowIndex)
      const entry = toc[rowIndex]
      if (entry) reportAnchor(entry.anchorId)
    },
    [toc, reportAnchor, playbackActive, pb]
  )

  if (loading) return <LoadingState />

  // Whole-session error: events isn't an array we can render.
  if (!Array.isArray(session.events)) {
    return <SessionError session={session} />
  }

  if (rows.length === 0) return <EmptyState />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {showToc && tocOpen && (
          <aside
            className={cn(
              'hidden w-60 shrink-0 border-r border-border bg-bg p-3 md:block',
              'overflow-hidden'
            )}
          >
            <TableOfContents
              entries={toc}
              activeRowIndex={playbackActive ? playbackActiveRow : activeRowIndex}
              onJump={onJump}
              onCollapse={() => setTocOpen(false)}
            />
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          {showToc && !tocOpen && (
            <button
              type="button"
              onClick={() => setTocOpen(true)}
              aria-label="Show table of contents"
              className="absolute left-2 top-2 z-10 hidden rounded-md border border-border bg-surface p-1.5 text-muted-foreground hover:text-accent md:inline-flex"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <TranscriptList
            ref={transcriptRef}
            items={items}
            highlightId={activeHighlightId ?? highlightId}
            virtualize={virtualize}
            onActiveRowChange={playbackActive ? undefined : onActiveRowChange}
            typingRowIndex={typingRowIndex}
            typingFraction={typingFraction}
          />
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Rendering session">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-sidebar text-muted-foreground">
          <Inbox className="size-5" />
        </div>
        <p className="mt-4 text-body text-text">Nothing to show yet</p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Drop or paste a Claude Code session to see it here.
        </p>
      </div>
    </div>
  )
}

function SessionError({ session }: { session: Session }) {
  const [showRaw, setShowRaw] = React.useState(false)
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert className="size-5" />
        </div>
        <p className="mt-4 text-body text-text">Couldn&rsquo;t render this session.</p>
        <p className="mt-1 text-body-sm text-muted-foreground">The session data looks malformed.</p>
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'Hide raw' : 'Show raw'}
          </Button>
        </div>
        {showRaw && (
          <div className="mt-3 text-left">
            <RawBlock value={session} label="Raw session" />
          </div>
        )}
      </div>
    </div>
  )
}
