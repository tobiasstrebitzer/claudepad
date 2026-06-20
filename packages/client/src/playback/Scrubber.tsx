import * as React from 'react';
import { cn } from '../lib/cn';
import type { Timeline, SegKind } from './buildTimeline';
import { formatClock, formatIdle } from './format';

// The timeline scrubber (PRD-08 §4.2, FR-7/22): an ARIA slider with per-event
// tick marks coloured by kind and collapsed idle gaps shown as a compressed
// band. Drag and click-to-seek map the pointer to a virtual time; the engine
// reveals the correct event set instantly (no intermediate animation).

// Token-only tick colours (the no-raw-hex gate forbids literal hex in source).
const TICK_COLOR: Record<Exclude<SegKind, 'idle'>, string> = {
  user: 'bg-accent',
  assistant: 'bg-text',
  thinking: 'bg-muted',
  tool: 'bg-muted/60',
  meta: 'bg-border',
};

// Skip per-event ticks past this count so the bar stays light on huge sessions
// (the fill + playhead still work; FR-20 spirit).
const MAX_TICKS = 250;

export function Scrubber({
  timeline,
  playheadMs,
  fraction,
  activeRowIndex,
  onSeekFraction,
}: {
  timeline: Timeline;
  playheadMs: number;
  fraction: number;
  activeRowIndex: number;
  onSeekFraction: (f: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const total = timeline.totalMs || 1;

  const seekFromClientX = React.useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const f = (clientX - rect.left) / rect.width;
      onSeekFraction(Math.min(1, Math.max(0, f)));
    },
    [onSeekFraction],
  );

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => seekFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, seekFromClientX]);

  const showTicks = timeline.segs.length <= MAX_TICKS;
  const valueText = `event ${Math.max(1, activeRowIndex + 1)} of ${timeline.rowCount}, ${formatClock(
    playheadMs,
  )}`;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Playback timeline"
      aria-valuemin={0}
      aria-valuemax={timeline.rowCount}
      aria-valuenow={activeRowIndex + 1}
      aria-valuetext={valueText}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
        seekFromClientX(e.clientX);
      }}
      className="group relative h-6 flex-1 cursor-pointer touch-none select-none"
    >
      {/* track */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
      {/* collapsed idle bands */}
      {timeline.segs.map((seg, i) =>
        seg.idleMarker ? (
          <div
            key={`idle-${i}`}
            title={formatIdle(seg.idleSeconds ?? 0, seg.dwellMs / 1000)}
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted/40 [background-image:repeating-linear-gradient(90deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]"
            style={{
              left: `${(seg.startMs / total) * 100}%`,
              width: `${Math.max(0.4, (seg.dwellMs / total) * 100)}%`,
            }}
          />
        ) : null,
      )}
      {/* elapsed fill */}
      <div
        className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
        style={{ width: `${fraction * 100}%` }}
      />
      {/* event ticks */}
      {showTicks &&
        timeline.segs.map((seg, i) =>
          seg.idleMarker ? null : (
            <span
              key={`tick-${i}`}
              aria-hidden
              className={cn(
                'absolute top-1/2 h-2.5 w-px -translate-y-1/2 opacity-70',
                TICK_COLOR[seg.kind as Exclude<SegKind, 'idle'>],
              )}
              style={{ left: `${(seg.startMs / total) * 100}%` }}
            />
          ),
        )}
      {/* playhead */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent shadow-[var(--shadow-sm)]',
          dragging && 'scale-110',
        )}
        style={{ left: `${fraction * 100}%` }}
      />
    </div>
  );
}
