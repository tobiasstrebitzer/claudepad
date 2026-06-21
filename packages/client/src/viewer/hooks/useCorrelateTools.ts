import * as React from 'react';
import type {
  Session,
  SessionEvent,
  ToolUseEvent,
  ToolResultEvent,
} from '@claudepad/schema';
import { isHiddenEvent } from './eventVisibility';

/**
 * A render-plan row: one top-level virtualized item. Tool results that
 * correlate to a tool_use are NOT emitted as their own row - they are nested
 * under the owning tool_use row. Uncorrelated results still get a standalone
 * row (FR-9). Correlation is render-time only and never mutates the Session.
 */
export type RenderRow =
  | { kind: 'event'; index: number; event: Exclude<SessionEvent, ToolResultEvent> }
  | { kind: 'tool'; index: number; event: ToolUseEvent; result?: ToolResultEvent }
  | { kind: 'orphan-result'; index: number; event: ToolResultEvent };

/**
 * Correlate tool_use ↔ tool_result.
 *
 * Primary key: `tool_result.forToolId === tool_use.toolId` (Anthropic
 * tool_use_id - the reliable link). Tie-break / fallback for results lacking a
 * forToolId: the nearest *preceding* unmatched tool_use with a matching
 * `forName`, else the nearest preceding unmatched tool_use. A result that
 * matches nothing renders standalone.
 */
export function correlateTools(events: readonly SessionEvent[]): RenderRow[] {
  // Map toolId -> the row index in `rows` for quick attachment.
  const byToolId = new Map<string, number>();
  // Preceding unmatched tool_use rows (for fallback correlation), newest last.
  const unmatched: number[] = [];
  const rows: RenderRow[] = [];

  events.forEach((event, index) => {
    // Pure session-metadata / telemetry never becomes a transcript row. Both
    // the viewer and the playback timeline derive rows from this function, so
    // filtering here keeps their indices in lockstep (preserved in raw view).
    if (isHiddenEvent(event)) return;

    if (event.kind === 'tool_use') {
      const row: RenderRow = { kind: 'tool', index, event };
      const rowIndex = rows.push(row) - 1;
      if (event.toolId) byToolId.set(event.toolId, rowIndex);
      unmatched.push(rowIndex);
      return;
    }

    if (event.kind === 'tool_result') {
      const target = findToolRow(event, rows, byToolId, unmatched);
      if (target != null) {
        const row = rows[target];
        if (row && row.kind === 'tool' && row.result == null) {
          row.result = event;
          // Remove from the unmatched pool.
          const u = unmatched.indexOf(target);
          if (u !== -1) unmatched.splice(u, 1);
          return;
        }
      }
      rows.push({ kind: 'orphan-result', index, event });
      return;
    }

    rows.push({ kind: 'event', index, event });
  });

  return rows;
}

function findToolRow(
  result: ToolResultEvent,
  rows: readonly RenderRow[],
  byToolId: ReadonlyMap<string, number>,
  unmatched: readonly number[],
): number | null {
  // 1) Exact id match (must still be unfilled).
  if (result.forToolId != null) {
    const idx = byToolId.get(result.forToolId);
    if (idx != null) {
      const row = rows[idx];
      if (row && row.kind === 'tool' && row.result == null) return idx;
    }
    // forToolId present but no match => standalone (don't guess).
    return null;
  }

  // 2) Fallback by forName among preceding unmatched tool_uses (nearest first).
  if (result.forName != null) {
    for (let i = unmatched.length - 1; i >= 0; i--) {
      const idx = unmatched[i];
      if (idx == null) continue;
      const row = rows[idx];
      if (row && row.kind === 'tool' && row.event.name === result.forName) return idx;
    }
  }

  // 3) Last resort: the nearest preceding unmatched tool_use.
  const last = unmatched[unmatched.length - 1];
  return last ?? null;
}

export function useCorrelateTools(session: Session): RenderRow[] {
  return React.useMemo(() => correlateTools(session.events), [session.events]);
}
