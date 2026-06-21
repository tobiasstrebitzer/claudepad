import * as React from 'react';
import { SquareTerminal } from 'lucide-react';
import type { MetaEvent } from '@claudepad/schema';
import { cn } from '../../../lib/cn';
import { SecretText } from '../blocks/SecretText';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function extract(raw: unknown): { stdout: string; stderr: string } {
  const content = isRecord(raw) ? raw['content'] : undefined;
  if (typeof content !== 'string') return { stdout: '', stderr: '' };
  const out = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)?.[1] ?? '';
  const err = content.match(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/)?.[1] ?? '';
  return { stdout: out.trim(), stderr: err.trim() };
}

/** Terminal-style output of a locally-run slash command. */
export const CommandOutputTurn = React.memo(function CommandOutputTurn({
  event,
  anchorId,
  highlighted,
}: {
  event: MetaEvent;
  anchorId: string;
  highlighted?: boolean;
}) {
  const { stdout, stderr } = React.useMemo(() => extract(event.raw), [event.raw]);
  const hasOutput = stdout.length > 0 || stderr.length > 0;

  return (
    <section
      id={anchorId}
      data-anchor-id={anchorId}
      role="article"
      aria-label="Command output"
      className={cn(
        'relative scroll-mt-24 rounded-md border border-border bg-bg px-3 py-2',
        highlighted && 'ring-2 ring-accent transition-shadow duration-[var(--motion-slow)]',
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-label uppercase tracking-[0.02em] text-muted">
        <SquareTerminal className="size-3.5 shrink-0" />
        <span>command output</span>
      </div>
      {hasOutput ? (
        <pre className="max-h-72 overflow-auto font-mono text-code text-text">
          <code>
            {stdout && <SecretText>{stdout}</SecretText>}
            {stderr && (
              <span className="block text-danger">
                <SecretText>{stderr}</SecretText>
              </span>
            )}
          </code>
        </pre>
      ) : (
        <p className="text-body-sm text-muted">(no output)</p>
      )}
    </section>
  );
});
