import * as React from 'react';
import type { SessionEvent } from '@claudepad/schema';

/**
 * Stable anchor id for an event. Prefers the source/event id; falls back to a
 * kind+index synthesized id so deep links work even when ids are absent. Kept
 * deterministic so a shared link survives a re-render (id stability across
 * re-parses is coordinated with PRD-02 - see PRD-03 §11.7).
 */
export function anchorIdFor(event: SessionEvent, index: number): string {
  if (event.id) return sanitizeAnchor(event.id);
  const prefix =
    event.kind === 'user'
      ? 'u'
      : event.kind === 'assistant'
        ? 'a'
        : event.kind === 'thinking'
          ? 'k'
          : event.kind === 'tool_use'
            ? 't'
            : event.kind === 'tool_result'
              ? 'r'
              : 'm';
  return `${prefix}${index}`;
}

function sanitizeAnchor(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Tracks the "current" anchor and notifies the host (replaceState, not push).
 * Returns a setter the transcript calls when the active turn changes, and the
 * id that should be highlighted-on-mount (from `initialAnchor`).
 */
export function useAnchor(
  initialAnchor: string | undefined,
  onAnchorChange: ((id: string) => void) | undefined,
) {
  const [highlightId, setHighlightId] = React.useState<string | undefined>(initialAnchor);
  const lastReported = React.useRef<string | undefined>(undefined);

  // Clear the one-shot highlight shortly after mount.
  React.useEffect(() => {
    if (!initialAnchor) return;
    setHighlightId(initialAnchor);
    const t = setTimeout(() => setHighlightId(undefined), 2000);
    return () => clearTimeout(t);
  }, [initialAnchor]);

  const reportAnchor = React.useCallback(
    (id: string) => {
      if (lastReported.current === id) return;
      lastReported.current = id;
      onAnchorChange?.(id);
    },
    [onAnchorChange],
  );

  return { highlightId, reportAnchor };
}
