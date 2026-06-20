import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/cn';
import type { RenderRow } from '../hooks/useCorrelateTools';
import { TurnRenderer } from './turns/TurnRenderer';

export interface TranscriptHandle {
  /** Scroll a row into view (used for deep-link + TOC jumps). */
  scrollToRow(rowIndex: number): void;
}

interface TranscriptListProps {
  rows: RenderRow[];
  highlightId?: string;
  /** Disable virtualization (jsdom/tests have no layout). */
  virtualize?: boolean;
  /** Report the top-most visible row as the user scrolls. */
  onActiveRowChange?: (rowIndex: number) => void;
}

/**
 * Virtualized transcript host (FR-23). Dynamic measured row heights —
 * expanding a tool result changes height, so we use `measureElement`. Anchor
 * scrolling uses `scrollToIndex` since target rows may be unmounted.
 */
export const TranscriptList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function TranscriptList(
    { rows, highlightId, virtualize = true, onActiveRowChange },
    ref,
  ) {
    if (!virtualize) {
      return (
        <PlainList
          ref={ref}
          rows={rows}
          highlightId={highlightId}
          onActiveRowChange={onActiveRowChange}
        />
      );
    }
    return (
      <VirtualList
        ref={ref}
        rows={rows}
        highlightId={highlightId}
        onActiveRowChange={onActiveRowChange}
      />
    );
  },
);

const VirtualList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function VirtualList({ rows, highlightId, onActiveRowChange }, ref) {
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 140,
      overscan: 6,
      // Stable measurement keyed by row identity keeps re-measure cheap.
      measureElement: (el) => el.getBoundingClientRect().height,
    });

    React.useImperativeHandle(
      ref,
      () => ({
        scrollToRow: (rowIndex: number) =>
          virtualizer.scrollToIndex(rowIndex, { align: 'start', behavior: 'auto' }),
      }),
      [virtualizer],
    );

    const items = virtualizer.getVirtualItems();

    // Report the top-most visible row for TOC viewport tracking + anchor sync.
    React.useEffect(() => {
      const first = items[0];
      if (first && onActiveRowChange) onActiveRowChange(first.index);
    }, [items, onActiveRowChange]);

    return (
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
                className="pb-3"
              >
                <TurnRenderer row={row} highlightId={highlightId} />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

const PlainList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function PlainList({ rows, highlightId }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        scrollToRow: (rowIndex: number) => {
          const row = rows[rowIndex];
          if (!row) return;
          const el = containerRef.current?.querySelector(
            `[data-row-index="${rowIndex}"]`,
          );
          (el as HTMLElement | null)?.scrollIntoView({ block: 'start' });
        },
      }),
      [rows],
    );

    return (
      <div ref={containerRef} className={cn('space-y-3 px-4 py-4')}>
        {rows.map((row, i) => (
          <div key={i} data-row-index={i}>
            <TurnRenderer row={row} highlightId={highlightId} />
          </div>
        ))}
      </div>
    );
  },
);
