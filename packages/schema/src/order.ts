// order.ts - total ordering of events (FR-25, FR-28).
//
// Precedence: (1) parentUuid→uuid DAG topologically sorted; (2) timestamp
// ascending where the DAG is ambiguous/absent; (3) original file/line order as
// the final tiebreaker. Deterministic; handles cycles and duplicate uuids
// without infinite-looping. Sidechain laning is preserved from the adapter.

import type { SessionEvent } from './types';

interface Node {
  event: SessionEvent;
  /** Stable original index (file/line order) - the ultimate tiebreaker. */
  fileIndex: number;
  /** Base id with any #N block suffix removed, for DAG linkage. */
  baseId: string | undefined;
  parentBaseId: string | undefined;
  /** Numeric timestamp for sorting, or +Infinity when absent. */
  tsMs: number;
  visited: boolean;
}

function baseId(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  const hash = id.indexOf('#');
  return hash === -1 ? id : id.slice(0, hash);
}

/**
 * Produce a deterministic total order over events. The input array is not
 * mutated; a new ordered array is returned.
 */
export function orderEvents(events: SessionEvent[]): SessionEvent[] {
  const nodes: Node[] = events.map((event, i) => ({
    event,
    fileIndex: i,
    baseId: baseId(event.id),
    parentBaseId:
      event.parentId === null ? undefined : baseId(event.parentId ?? undefined),
    tsMs: tsToMs(event.ts),
    visited: false,
  }));

  // Group nodes by baseId so block-split events (#0,#1,…) stay contiguous and
  // a parent edge resolves to the group's first node.
  const byBaseId = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.baseId === undefined) continue;
    const arr = byBaseId.get(n.baseId);
    if (arr) arr.push(n);
    else byBaseId.set(n.baseId, [n]);
  }

  // Compute, for each node, a comparable "root sort key" derived from walking
  // up the parent chain to a root, accumulating (tsMs, fileIndex) along the way.
  // This gives DAG-respecting order while timestamp + file order break ties.
  // Cycles are broken by a visited guard (falls back to file order).
  const depthCache = new Map<Node, number>();

  function depthOf(n: Node, guard: Set<Node>): number {
    const cached = depthCache.get(n);
    if (cached !== undefined) return cached;
    if (n.parentBaseId === undefined) {
      depthCache.set(n, 0);
      return 0;
    }
    if (guard.has(n)) {
      // Cycle - treat as root to stay finite.
      return 0;
    }
    const parentGroup = byBaseId.get(n.parentBaseId);
    if (!parentGroup || parentGroup.length === 0) {
      depthCache.set(n, 0);
      return 0;
    }
    guard.add(n);
    // Parent is the first node of the parent's group.
    const parent = parentGroup[0]!;
    const d = parent === n ? 0 : depthOf(parent, guard) + 1;
    guard.delete(n);
    depthCache.set(n, d);
    return d;
  }

  for (const n of nodes) depthOf(n, new Set());

  // Sort: primarily by a topological key, then timestamp, then file order.
  // We approximate the DAG order with (rootTsMs, depth, tsMs, fileIndex) so that
  // events under the same root cluster, deeper events follow shallower ones, and
  // timestamp + file order break remaining ties. This is deterministic.
  const rootKeyCache = new Map<Node, { rootTs: number; rootIndex: number }>();

  function rootKey(n: Node, guard: Set<Node>): { rootTs: number; rootIndex: number } {
    const cached = rootKeyCache.get(n);
    if (cached) return cached;
    if (n.parentBaseId === undefined || guard.has(n)) {
      const key = { rootTs: n.tsMs, rootIndex: n.fileIndex };
      rootKeyCache.set(n, key);
      return key;
    }
    const parentGroup = byBaseId.get(n.parentBaseId);
    if (!parentGroup || parentGroup.length === 0 || parentGroup[0] === n) {
      const key = { rootTs: n.tsMs, rootIndex: n.fileIndex };
      rootKeyCache.set(n, key);
      return key;
    }
    guard.add(n);
    const key = rootKey(parentGroup[0]!, guard);
    guard.delete(n);
    rootKeyCache.set(n, key);
    return key;
  }

  const decorated = nodes.map((n) => ({
    node: n,
    root: rootKey(n, new Set()),
    depth: depthCache.get(n) ?? 0,
  }));

  decorated.sort((a, b) => {
    // 1. Cluster by root timestamp (DAG roots in chronological order).
    if (a.root.rootTs !== b.root.rootTs) return a.root.rootTs - b.root.rootTs;
    // 2. Same root timestamp: keep roots in file order.
    if (a.root.rootIndex !== b.root.rootIndex) return a.root.rootIndex - b.root.rootIndex;
    // 3. Within a cluster, shallower (ancestors) before deeper (descendants).
    if (a.depth !== b.depth) return a.depth - b.depth;
    // 4. Timestamp ascending.
    if (a.node.tsMs !== b.node.tsMs) return a.node.tsMs - b.node.tsMs;
    // 5. Original file/line order - the final, deterministic tiebreaker.
    return a.node.fileIndex - b.node.fileIndex;
  });

  return decorated.map((d) => d.node.event);
}

function tsToMs(ts: string | undefined): number {
  if (ts === undefined) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}
