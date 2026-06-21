import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/cn';
import { TurnRenderer } from './turns/TurnRenderer';
import { ToolRunGroup } from './turns/ToolRunGroup';
import { IdleDivider } from './turns/IdleDivider';
import { type ViewItem, baseToViewIndex } from '../hooks/groupRows';

export interface ScrollToRowOptions {
  behavior?: ScrollBehavior;
  align?: 'start' | 'center';
}

export interface TranscriptHandle {
  /** Scroll a base-row position into view (deep-link + TOC jumps + playback). */
  scrollToRow(rowIndex: number, opts?: ScrollToRowOptions): void;
}

interface TranscriptListProps {
  /** Display items (single rows + folded tool runs); indices stay base-relative. */
  items: ViewItem[];
  highlightId?: string;
  /** Disable virtualization (jsdom/tests have no layout). */
  virtualize?: boolean;
  /** Report the top-most visible base-row position as the user scrolls. */
  onActiveRowChange?: (rowIndex: number) => void;
  /** Playback typing reveal (PRD-08): the fraction applies to base `typingRowIndex`. */
  typingRowIndex?: number;
  typingFraction?: number;
}

/** Render one display item (a single turn or a folded tool run). */
function ItemView({
  item,
  highlightId,
  typingRowIndex,
  typingFraction,
}: {
  item: ViewItem;
  highlightId?: string;
  typingRowIndex?: number;
  typingFraction?: number;
}) {
  if (item.kind === 'idle') {
    return <IdleDivider gapMs={item.gapMs} />;
  }
  if (item.kind === 'tool-run') {
    return <ToolRunGroup rows={item.rows} highlightId={highlightId} />;
  }
  return (
    <TurnRenderer
      row={item.row}
      highlightId={highlightId}
      typingFraction={item.baseStart === typingRowIndex ? typingFraction : undefined}
    />
  );
}

/**
 * Virtualized transcript host (FR-23). Dynamic measured heights - expanding a
 * tool result or a folded run changes height, so we use `measureElement`. The
 * public API speaks base-row positions; we translate to view-item indices via
 * `baseToViewIndex` so grouping never desyncs the TOC / deep links / playback.
 */
export const TranscriptList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function TranscriptList(
    { items, highlightId, virtualize = true, onActiveRowChange, typingRowIndex, typingFraction },
    ref,
  ) {
    const shared = { items, highlightId, onActiveRowChange, typingRowIndex, typingFraction };
    if (!virtualize) {
      return <PlainList ref={ref} {...shared} />;
    }
    return <VirtualList ref={ref} {...shared} />;
  },
);

const VirtualList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function VirtualList(
    { items, highlightId, onActiveRowChange, typingRowIndex, typingFraction },
    ref,
  ) {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const baseToView = React.useMemo(() => baseToViewIndex(items), [items]);

    const virtualizer = useVirtualizer({
      count: items.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 140,
      overscan: 6,
      measureElement: (el) => el.getBoundingClientRect().height,
    });

    React.useImperativeHandle(
      ref,
      () => ({
        scrollToRow: (rowIndex: number, opts?: ScrollToRowOptions) =>
          virtualizer.scrollToIndex(baseToView[rowIndex] ?? rowIndex, {
            align: opts?.align ?? 'start',
            behavior: opts?.behavior ?? 'auto',
          }),
      }),
      [virtualizer, baseToView],
    );

    const virtualItems = virtualizer.getVirtualItems();

    // Report the top-most visible base-row position for TOC viewport tracking.
    React.useEffect(() => {
      const first = virtualItems[0];
      const item = first ? items[first.index] : undefined;
      if (item && item.kind !== 'idle' && onActiveRowChange) onActiveRowChange(item.baseStart);
    }, [virtualItems, items, onActiveRowChange]);

    return (
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualItems.map((vi) => {
            const item = items[vi.index];
            if (!item) return null;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
                className="pb-3"
              >
                <ItemView
                  item={item}
                  highlightId={highlightId}
                  typingRowIndex={typingRowIndex}
                  typingFraction={typingFraction}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

const PlainList = React.forwardRef<TranscriptHandle, TranscriptListProps>(
  function PlainList({ items, highlightId, typingRowIndex, typingFraction }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const baseToView = React.useMemo(() => baseToViewIndex(items), [items]);

    React.useImperativeHandle(
      ref,
      () => ({
        scrollToRow: (rowIndex: number, opts?: ScrollToRowOptions) => {
          const vi = baseToView[rowIndex] ?? rowIndex;
          const el = containerRef.current?.querySelector(`[data-view-index="${vi}"]`);
          (el as HTMLElement | null)?.scrollIntoView({
            block: opts?.align === 'center' ? 'center' : 'start',
            behavior: opts?.behavior ?? 'auto',
          });
        },
      }),
      [baseToView],
    );

    return (
      <div ref={containerRef} className={cn('space-y-3 px-4 py-4')}>
        {items.map((item, vi) => (
          <div
            key={vi}
            data-view-index={vi}
            data-row-index={item.kind === 'idle' ? undefined : item.baseStart}
          >
            <ItemView
              item={item}
              highlightId={highlightId}
              typingRowIndex={typingRowIndex}
              typingFraction={typingFraction}
            />
          </div>
        ))}
      </div>
    );
  },
);
