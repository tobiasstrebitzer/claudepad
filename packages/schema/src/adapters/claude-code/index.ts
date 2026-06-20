// adapters/claude-code/index.ts — the Claude Code source adapter.

import type { SessionMeta, SessionSource } from '../../types';
import type { RawRecord } from '../../detect';
import { detectClaudeCodeConfidence, detectVersion, isObject } from '../../detect';
import { normalizeTimestamp } from '../../time';
import type { MapContext, MapOutput } from './events';
import { mapRecord } from './events';

export interface SourceAdapter {
  id: SessionSource;
  detect(records: RawRecord[]): number;
  detectVersion(records: RawRecord[]): string;
  mapRecord(rec: RawRecord, ctx: MapContext): MapOutput;
  liftMeta(records: RawRecord[]): Partial<SessionMeta>;
}

/** Lift session-scoped fields (title/cwd/model/startedAt/…) into SessionMeta (FR-20, FR-27). */
function liftMeta(records: RawRecord[]): Partial<SessionMeta> {
  const meta: Partial<SessionMeta> = {};
  const modelCounts: Record<string, number> = {};
  let firstUserText: string | undefined;

  for (const r of records) {
    const type = r['type'];

    if (type === 'ai-title' && typeof r['aiTitle'] === 'string' && !meta.title) {
      meta.title = r['aiTitle'];
    }

    if (meta.cwd === undefined && typeof r['cwd'] === 'string') {
      meta.cwd = r['cwd'];
    }
    if (meta.gitBranch === undefined && typeof r['gitBranch'] === 'string') {
      meta.gitBranch = r['gitBranch'];
    }
    if (meta.entrypoint === undefined && typeof r['entrypoint'] === 'string') {
      meta.entrypoint = r['entrypoint'];
    }

    // Dominant assistant model.
    if (type === 'assistant') {
      const message = r['message'];
      const model = isObject(message) ? message['model'] : undefined;
      if (typeof model === 'string') {
        modelCounts[model] = (modelCounts[model] ?? 0) + 1;
      }
    }

    // First human user line, as a title fallback.
    if (firstUserText === undefined && type === 'user') {
      const message = r['message'];
      const content = isObject(message) ? message['content'] : undefined;
      if (typeof content === 'string' && content.trim().length > 0) {
        firstUserText = content.trim();
      }
    }
  }

  // Dominant model wins.
  const modelEntries = Object.entries(modelCounts);
  if (modelEntries.length > 0) {
    modelEntries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const top = modelEntries[0];
    if (top) meta.model = top[0];
  }

  // Title fallback: first user line (truncated).
  if (meta.title === undefined && firstUserText !== undefined) {
    meta.title = firstUserText.length > 80 ? firstUserText.slice(0, 80) : firstUserText;
  }

  return meta;
}

/** Derive startedAt/endedAt from all valid timestamps (FR-27). */
export function deriveTimeBounds(records: RawRecord[]): {
  startedAt?: string;
  endedAt?: string;
} {
  let started: number | undefined;
  let ended: number | undefined;
  for (const r of records) {
    const ts = normalizeTimestamp(r['timestamp']);
    if (ts === undefined) continue;
    const ms = Date.parse(ts);
    if (started === undefined || ms < started) started = ms;
    if (ended === undefined || ms > ended) ended = ms;
  }
  const out: { startedAt?: string; endedAt?: string } = {};
  if (started !== undefined) out.startedAt = new Date(started).toISOString();
  if (ended !== undefined) out.endedAt = new Date(ended).toISOString();
  return out;
}

export const claudeCodeAdapter: SourceAdapter = {
  id: 'claude-code',
  detect: detectClaudeCodeConfidence,
  detectVersion: (records) => detectVersion(records).version,
  mapRecord,
  liftMeta,
};
