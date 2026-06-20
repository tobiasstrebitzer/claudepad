import { Share2, X, Info } from 'lucide-react';
import type { Session, DiagnosticRecord } from '@claudepad/schema';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '../components/ui/tooltip';

// Persistent local-only status + choice point (PRD-04 §4.2). Loading never shares;
// Share is an explicit, separate action that arrives with P3 (identity + crypto),
// so it's surfaced-but-disabled here (FR-23). Clear drops the in-memory session.
export function LoadedBanner({
  session,
  diagnostics,
  fileName,
  onClear,
}: {
  session: Session;
  diagnostics: DiagnosticRecord[];
  fileName?: string;
  onClear: () => void;
}) {
  const title = session.meta.title ?? fileName ?? 'Untitled session';
  const events = session.events.length;
  const notes = diagnostics.length;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-2 text-body-sm">
        <span className="min-w-0 flex-1 truncate text-text">
          <span className="text-muted">Loaded</span> {title}
          <span className="text-muted"> · {events} events</span>
        </span>

        {notes > 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="warn" className="cursor-default">
                  <Info className="size-3" />
                  {notes} {notes === 1 ? 'note' : 'notes'}
                </Badge>
              }
            />
            <TooltipContent>
              Parsed with caveats — {diagnostics[0]?.message ?? 'see diagnostics'}
              {notes > 1 ? ` (+${notes - 1} more)` : ''}
            </TooltipContent>
          </Tooltip>
        )}

        <Badge variant="success">local only</Badge>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="sm" variant="secondary" disabled>
                <Share2 />
                Share…
              </Button>
            }
          />
          <TooltipContent>
            Encrypted sharing arrives in P3 (identity + crypto)
          </TooltipContent>
        </Tooltip>

        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear session">
          <X />
          Clear
        </Button>
      </div>
    </TooltipProvider>
  );
}
