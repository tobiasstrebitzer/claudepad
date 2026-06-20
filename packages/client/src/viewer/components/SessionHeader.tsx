import {
  Cpu,
  FolderOpen,
  Clock,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { Session } from '@claudepad/schema';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { formatAbsolute, formatRelative, formatDuration } from '../format';
import { useExpandSignal } from '../hooks/useExpand';
import { useReveal } from '../hooks/useReveal';

/** Sticky session header (FR-14): title, model, cwd, time, duration + controls. */
export function SessionHeader({ session }: { session: Session }) {
  const { meta } = session;
  const expand = useExpandSignal();
  const reveal = useReveal();

  // Derive duration from meta.endedAt or the last event's ts (FR-14, §11.5).
  const lastTs = lastEventTs(session);
  const duration = formatDuration(meta.startedAt, meta.endedAt ?? lastTs);
  const started = formatAbsolute(meta.startedAt);

  return (
    <header className="border-b border-border bg-bg/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {meta.title && (
            <h1 className="truncate font-serif text-heading-1 text-text">{meta.title}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
            {meta.model && (
              <span className="inline-flex items-center gap-1">
                <Cpu className="size-3.5 text-accent" />
                <span className="font-mono text-code">{meta.model}</span>
              </span>
            )}
            {meta.cwd && (
              <span className="inline-flex items-center gap-1">
                <FolderOpen className="size-3.5" />
                <span className="truncate font-mono text-code">{meta.cwd}</span>
              </span>
            )}
            {started && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      <span>{started}</span>
                      {duration && <span className="text-muted">· {duration}</span>}
                    </span>
                  }
                />
                <TooltipContent>{formatRelative(meta.startedAt)}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {reveal.hasMap && (
            <SecretsControl onRevealAll={reveal.revealAll} onHideAll={reveal.hideAll} />
          )}
          {expand && (
            <>
              <ExpandControl
                onExpandAll={() => expand.expandAll('all')}
                onCollapseAll={() => expand.collapseAll('all')}
                onExpandThinking={() => expand.expandAll('thinking')}
                onCollapseThinking={() => expand.collapseAll('thinking')}
                onExpandTools={() => expand.expandAll('toolIO')}
                onCollapseTools={() => expand.collapseAll('toolIO')}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function SecretsControl({
  onRevealAll,
  onHideAll,
}: {
  onRevealAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" size="sm">
            <Eye className="size-4" />
            Secrets
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuLabel>Revealed values</DropdownMenuLabel>
        <DropdownMenuItem onClick={onRevealAll}>
          <Eye className="size-4" />
          Reveal all
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onHideAll}>
          <EyeOff className="size-4" />
          Hide all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpandControl(props: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandThinking: () => void;
  onCollapseThinking: () => void;
  onExpandTools: () => void;
  onCollapseTools: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Expand or collapse blocks">
            <ChevronsUpDown className="size-4" />
            View
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={props.onExpandAll}>
          <ChevronsUpDown className="size-4" />
          Expand all
        </DropdownMenuItem>
        <DropdownMenuItem onClick={props.onCollapseAll}>
          <ChevronsDownUp className="size-4" />
          Collapse all
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Thinking</DropdownMenuLabel>
        <DropdownMenuItem onClick={props.onExpandThinking}>Expand</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onCollapseThinking}>Collapse</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tool I/O</DropdownMenuLabel>
        <DropdownMenuItem onClick={props.onExpandTools}>Expand</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onCollapseTools}>Collapse</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function lastEventTs(session: Session): string | undefined {
  for (let i = session.events.length - 1; i >= 0; i--) {
    const ts = session.events[i]?.ts;
    if (ts) return ts;
  }
  return undefined;
}
