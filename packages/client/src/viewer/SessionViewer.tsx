import * as React from 'react';
import { PanelLeftOpen, TriangleAlert, Inbox } from 'lucide-react';
import type { Session } from '@claudepad/schema';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { TooltipProvider } from '../components/ui/tooltip';
import { RevealProvider, type SecretMap } from './hooks/useReveal';
import { ExpandProvider } from './hooks/useExpand';
import { useCorrelateTools } from './hooks/useCorrelateTools';
import { useAnchor } from './hooks/useAnchor';
import { SessionHeader } from './components/SessionHeader';
import { buildToc, TableOfContents } from './components/TableOfContents';
import { TranscriptList, type TranscriptHandle } from './components/TranscriptList';
import { RawBlock } from './components/blocks/RawBlock';
import { BlockErrorBoundary } from './components/BlockErrorBoundary';

export interface SessionViewerOptions {
  defaultCollapse?: { thinking?: boolean; toolIO?: boolean };
  showToc?: boolean;
  virtualize?: boolean;
  loading?: boolean;
  onAnchorChange?: (id: string) => void;
}

export interface SessionViewerProps {
  session: Session;
  secretMap?: SecretMap;
  initialAnchor?: string;
  options?: SessionViewerOptions;
}

/**
 * Top-level session renderer (PRD-03). Header + TOC + virtualized transcript.
 * Pure render surface: holds no keys, does no crypto, makes no network calls.
 */
export function SessionViewer({
  session,
  secretMap,
  initialAnchor,
  options,
}: SessionViewerProps) {
  return (
    <BlockErrorBoundary fallbackValue={session}>
      <TooltipProvider>
        <RevealProvider secretMap={secretMap}>
          <ExpandProvider>
            <ViewerInner
              session={session}
              initialAnchor={initialAnchor}
              options={options}
            />
          </ExpandProvider>
        </RevealProvider>
      </TooltipProvider>
    </BlockErrorBoundary>
  );
}

function ViewerInner({
  session,
  initialAnchor,
  options,
}: {
  session: Session;
  initialAnchor?: string;
  options?: SessionViewerOptions;
}) {
  const showToc = options?.showToc ?? true;
  const virtualize = options?.virtualize ?? true;
  const loading = options?.loading ?? false;

  const rows = useCorrelateTools(session);
  const toc = React.useMemo(() => buildToc(rows), [rows]);
  const { highlightId, reportAnchor } = useAnchor(initialAnchor, options?.onAnchorChange);

  const transcriptRef = React.useRef<TranscriptHandle>(null);
  const [activeRowIndex, setActiveRowIndex] = React.useState<number | null>(
    rows.length ? 0 : null,
  );
  const [tocOpen, setTocOpen] = React.useState(showToc);

  // Deep-link: scroll the initial anchor into view on mount (FR-16).
  React.useEffect(() => {
    if (!initialAnchor) return;
    const idx = toc.findIndex((e) => e.anchorId === initialAnchor);
    if (idx >= 0) {
      // Defer to let the virtualizer mount.
      const t = requestAnimationFrame(() => transcriptRef.current?.scrollToRow(idx));
      return () => cancelAnimationFrame(t);
    }
    return;
  }, [initialAnchor, toc]);

  const onActiveRowChange = React.useCallback(
    (rowIndex: number) => {
      setActiveRowIndex(rowIndex);
      const entry = toc[rowIndex];
      if (entry) reportAnchor(entry.anchorId);
    },
    [toc, reportAnchor],
  );

  const onJump = React.useCallback(
    (rowIndex: number) => {
      transcriptRef.current?.scrollToRow(rowIndex);
      setActiveRowIndex(rowIndex);
      const entry = toc[rowIndex];
      if (entry) reportAnchor(entry.anchorId);
    },
    [toc, reportAnchor],
  );

  if (loading) return <LoadingState />;

  // Whole-session error: events isn't an array we can render.
  if (!Array.isArray(session.events)) {
    return <SessionError session={session} />;
  }

  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionHeader session={session} />
      <div className="flex min-h-0 flex-1">
        {showToc && tocOpen && (
          <aside
            className={cn(
              'hidden w-60 shrink-0 border-r border-border bg-bg p-3 md:block',
              'overflow-hidden',
            )}
          >
            <TableOfContents
              entries={toc}
              activeRowIndex={activeRowIndex}
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
              className="absolute left-2 top-2 z-10 hidden rounded-md border border-border bg-surface p-1.5 text-muted hover:text-accent md:inline-flex"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <TranscriptList
            ref={transcriptRef}
            rows={rows}
            highlightId={highlightId}
            virtualize={virtualize}
            onActiveRowChange={onActiveRowChange}
          />
        </div>
      </div>
    </div>
  );
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
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-sidebar text-muted">
          <Inbox className="size-5" />
        </div>
        <p className="mt-4 text-body text-text">Nothing to show yet</p>
        <p className="mt-1 text-body-sm text-muted">
          Drop or paste a Claude Code session to see it here.
        </p>
      </div>
    </div>
  );
}

function SessionError({ session }: { session: Session }) {
  const [showRaw, setShowRaw] = React.useState(false);
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert className="size-5" />
        </div>
        <p className="mt-4 text-body text-text">Couldn&rsquo;t render this session.</p>
        <p className="mt-1 text-body-sm text-muted">The session data looks malformed.</p>
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
  );
}
