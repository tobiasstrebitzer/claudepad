import * as React from 'react';
import { Link2, Check } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { formatClock, formatAbsolute } from '../../format';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

interface TurnShellProps {
  anchorId: string;
  ts?: string;
  /** Visual variant: user (sidebar surface) vs assistant (surface + ◆ marker). */
  variant: 'user' | 'assistant' | 'system';
  roleLabel: string;
  /** Extra header detail (e.g. model badge). */
  headerExtra?: React.ReactNode;
  /** Briefly highlighted (deep-link target). */
  highlighted?: boolean;
  children: React.ReactNode;
}

/**
 * Common turn frame: surface + role marker + timestamp + copy-deep-link.
 * Pure function of props (no time/playback state) so PRD-08 can drive it.
 */
export function TurnShell({
  anchorId,
  ts,
  variant,
  roleLabel,
  headerExtra,
  highlighted,
  children,
}: TurnShellProps) {
  return (
    <section
      id={anchorId}
      data-anchor-id={anchorId}
      role="article"
      aria-label={`${roleLabel} turn`}
      className={cn(
        'group/turn relative scroll-mt-24 rounded-lg border px-4 py-3',
        variant === 'user'
          ? 'border-border bg-sidebar'
          : variant === 'assistant'
            ? 'border-border bg-surface'
            : 'border-dashed border-border bg-bg',
        highlighted &&
          'ring-2 ring-accent transition-shadow duration-[var(--motion-slow)]',
      )}
    >
      <header className="mb-2 flex items-center gap-2 text-label text-muted">
        {variant === 'assistant' && (
          <span aria-hidden className="text-accent">
            ◆
          </span>
        )}
        <span className="font-medium uppercase tracking-[0.02em]">{roleLabel}</span>
        {headerExtra}
        <span className="ml-auto flex items-center gap-1.5">
          {ts && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <time dateTime={ts} className="tabular-nums">
                    {formatClock(ts)}
                  </time>
                }
              />
              <TooltipContent>{formatAbsolute(ts)}</TooltipContent>
            </Tooltip>
          )}
          <CopyLinkButton anchorId={anchorId} />
        </span>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function CopyLinkButton({ anchorId }: { anchorId: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = React.useCallback(async () => {
    const base =
      typeof window !== 'undefined'
        ? (window.location.href.split('#')[0]?.split('?')[0] ?? '')
        : '';
    const link = `${base}#msg=${anchorId}`;
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* best effort */
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [anchorId]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy link to ${anchorId}`}
      className={cn(
        'rounded-sm p-0.5 text-muted opacity-0 transition-opacity hover:text-accent',
        'focus-visible:opacity-100 group-hover/turn:opacity-100',
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Link2 className="size-3.5" />
      )}
    </button>
  );
}
