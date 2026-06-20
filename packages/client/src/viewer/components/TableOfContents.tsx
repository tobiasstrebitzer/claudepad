import { User, Sparkles, Wrench, Brain, Info, PanelLeftClose } from 'lucide-react';
import type { ContentBlock } from '@claudepad/schema';
import { cn } from '../../lib/cn';
import type { RenderRow } from '../hooks/useCorrelateTools';
import { anchorIdFor } from '../hooks/useAnchor';

export interface TocEntry {
  rowIndex: number;
  anchorId: string;
  kind: RenderRow['kind'] | 'user' | 'assistant' | 'thinking' | 'meta';
  icon: 'user' | 'assistant' | 'tool' | 'thinking' | 'meta';
  label: string;
}

/** Build a compact TOC label per row. */
export function buildToc(rows: readonly RenderRow[]): TocEntry[] {
  return rows.map((row, rowIndex) => {
    const anchorId = anchorIdFor(row.event, row.index);
    if (row.kind === 'tool') {
      return { rowIndex, anchorId, kind: 'tool', icon: 'tool', label: row.event.name };
    }
    if (row.kind === 'orphan-result') {
      return {
        rowIndex,
        anchorId,
        kind: 'orphan-result',
        icon: 'tool',
        label: row.event.forName ? `result · ${row.event.forName}` : 'result',
      };
    }
    const event = row.event;
    switch (event.kind) {
      case 'user':
        return {
          rowIndex,
          anchorId,
          kind: 'user',
          icon: 'user',
          label: firstText(event.content) || 'User',
        };
      case 'assistant':
        return {
          rowIndex,
          anchorId,
          kind: 'assistant',
          icon: 'assistant',
          label: firstText(event.content) || 'Assistant',
        };
      case 'thinking':
        return {
          rowIndex,
          anchorId,
          kind: 'thinking',
          icon: 'thinking',
          label: 'Thinking',
        };
      default:
        return {
          rowIndex,
          anchorId,
          kind: 'meta',
          icon: 'meta',
          label: event.kind === 'meta' ? event.note || 'Note' : 'Note',
        };
    }
  });
}

const ICONS = {
  user: User,
  assistant: Sparkles,
  tool: Wrench,
  thinking: Brain,
  meta: Info,
} as const;

/**
 * Table-of-contents / minimap (FR-18). Jump-to on click; the active row is
 * highlighted. Collapsible; hidden < md (handled by the parent layout).
 */
export function TableOfContents({
  entries,
  activeRowIndex,
  onJump,
  onCollapse,
}: {
  entries: TocEntry[];
  activeRowIndex: number | null;
  onJump: (rowIndex: number) => void;
  onCollapse?: () => void;
}) {
  return (
    <nav aria-label="Table of contents" className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-label uppercase tracking-[0.02em] text-muted">Turns</span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide table of contents"
            className="rounded-sm p-0.5 text-muted hover:text-accent"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon];
          const active = entry.rowIndex === activeRowIndex;
          return (
            <li key={entry.anchorId}>
              <button
                type="button"
                onClick={() => onJump(entry.rowIndex)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-body-sm',
                  'transition-colors duration-[120ms]',
                  active
                    ? 'bg-accent-tint text-accent'
                    : 'text-muted hover:bg-sidebar hover:text-text',
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{entry.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function firstText(blocks: ContentBlock[]): string {
  for (const b of blocks) {
    if (b.type === 'text' && b.text.trim()) {
      return b.text.replace(/\s+/g, ' ').trim().slice(0, 48);
    }
  }
  return '';
}
