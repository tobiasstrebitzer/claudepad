import type { RenderRow } from './useCorrelateTools';

/**
 * A transcript display item:
 * - `single`   - one render row
 * - `tool-run` - a folded run of consecutive tool calls (same or mixed names)
 * - `idle`     - a "N later" divider for a long real-time gap between turns
 *
 * `baseStart` is the position of the first underlying row in the *base*
 * (ungrouped) row array - the index space the TOC, deep links, and the playback
 * engine speak - so grouping stays a pure display transform that never desyncs
 * those indices. `idle` items carry no rows and no base position.
 */
export type ViewItem =
  | { kind: 'single'; baseStart: number; row: RenderRow }
  | { kind: 'tool-run'; baseStart: number; rows: RenderRow[] }
  | { kind: 'idle'; gapMs: number };

/** Minimum consecutive tool calls before they fold (matches pacing.toolSpamRun). */
export const TOOL_RUN_MIN = 3;

/** Real-time gap between turns that earns a "N later" divider in the reading view. */
export const IDLE_DIVIDER_MS = 5 * 60_000;

function tsMs(row: RenderRow): number | undefined {
  const ts = row.event.ts;
  if (!ts) return undefined;
  const n = Date.parse(ts);
  return Number.isNaN(n) ? undefined : n;
}

interface GroupOptions {
  minRun?: number;
  idleMs?: number;
}

/**
 * Fold runs of >= `minRun` consecutive tool rows into one item (a run is broken
 * by any non-tool row, so it never crosses a conversation turn), and insert idle
 * dividers where the real-time gap between turns exceeds `idleMs`.
 */
export function groupRows(
  rows: readonly RenderRow[],
  { minRun = TOOL_RUN_MIN, idleMs = IDLE_DIVIDER_MS }: GroupOptions = {},
): ViewItem[] {
  const items: ViewItem[] = [];
  let i = 0;
  let lastTs: number | undefined;

  const maybeIdle = (nextTs: number | undefined) => {
    if (lastTs != null && nextTs != null && nextTs - lastTs >= idleMs) {
      items.push({ kind: 'idle', gapMs: nextTs - lastTs });
    }
  };

  while (i < rows.length) {
    const row = rows[i]!;

    if (row.kind === 'tool') {
      let k = 1;
      while (i + k < rows.length && rows[i + k]!.kind === 'tool') k++;
      if (k >= minRun) {
        maybeIdle(tsMs(row));
        items.push({ kind: 'tool-run', baseStart: i, rows: rows.slice(i, i + k) });
        lastTs = tsMs(rows[i + k - 1]!) ?? lastTs;
        i += k;
        continue;
      }
    }

    maybeIdle(tsMs(row));
    items.push({ kind: 'single', baseStart: i, row });
    lastTs = tsMs(row) ?? lastTs;
    i++;
  }
  return items;
}

/** Map each base-row position to the index of the view item that contains it. */
export function baseToViewIndex(items: readonly ViewItem[]): number[] {
  const map: number[] = [];
  items.forEach((item, vi) => {
    if (item.kind === 'idle') return;
    const len = item.kind === 'tool-run' ? item.rows.length : 1;
    for (let j = 0; j < len; j++) map[item.baseStart + j] = vi;
  });
  return map;
}

/** Label for a folded tool run: "Read ×6" when uniform, else "6 tool calls". */
export function toolRunLabel(rows: readonly RenderRow[]): { name?: string; count: number } {
  const names = new Set<string>();
  for (const r of rows) if (r.kind === 'tool') names.add(r.event.name);
  return { name: names.size === 1 ? [...names][0] : undefined, count: rows.length };
}
