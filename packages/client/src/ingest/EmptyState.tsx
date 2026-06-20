import * as React from 'react';
import { ChevronRight, Copy, Check, Lock } from 'lucide-react';
import { cn } from '../lib/cn';
import { ReadingColumn } from '../components/shell/AppShell';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '../components/ui/collapsible';
import { allOnboarding, detectOS } from '@claudepad/ingest';
import { DropZone } from './DropZone';
import { useCopy } from './useCopy';

// First-run / empty state (PRD-04 §4.1, FR-7/8/9): serif greeting, drop+paste target,
// OS-aware "where are my sessions?" disclosure with a copy-able one-liner, and the
// always-present trust line.
export function EmptyState({
  onFile,
  onMultiple,
}: {
  onFile: (file: File) => void;
  onMultiple?: (count: number) => void;
}) {
  const os = React.useMemo(() => detectOS(), []);
  const guides = React.useMemo(() => allOnboarding(os), [os]);
  const [copied, copy] = useCopy();

  return (
    <ReadingColumn>
      <p className="text-body-sm text-muted">Afternoon</p>
      <h1 className="mt-1 font-serif text-display-xl text-text">
        Drop a session to begin
      </h1>
      <p className="mt-4 max-w-prose text-body text-muted">
        See your Claude Code session beautifully — then, later, share it encrypted to one
        person. Everything stays on your device.
      </p>

      <div className="mt-8">
        <DropZone onFile={onFile} onMultiple={onMultiple} />
      </div>

      <Collapsible className="mt-8">
        <CollapsibleTrigger
          className={cn(
            'group flex w-full items-center gap-2 rounded-md px-1 py-2 text-body-sm text-text',
            'hover:text-accent',
          )}
        >
          <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
          Where are my Claude Code sessions?
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="mt-2 space-y-3 rounded-lg border border-border bg-surface p-4">
            {guides.map((g, i) => (
              <div key={g.os} className={cn(i > 0 && 'border-t border-border pt-3')}>
                <p className="text-label uppercase tracking-[0.02em] text-muted">
                  {g.label}
                </p>
                <code className="mt-1 block break-all font-mono text-code text-text">
                  {g.path}
                </code>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-sm bg-sidebar px-2 py-1 font-mono text-code text-muted">
                    {g.listOneLiner}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(g.listOneLiner)}
                    aria-label={`Copy the ${g.label} list-sessions command`}
                    className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-label text-muted hover:bg-accent-tint hover:text-accent"
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-body-sm text-muted">
              The most-recently-modified file is your latest session.
            </p>
          </div>
        </CollapsiblePanel>
      </Collapsible>

      <p className="mt-6 inline-flex items-center gap-2 text-body-sm text-muted">
        <Lock className="size-4 text-success" />
        Nothing is uploaded — parsing happens entirely in your browser.
      </p>
    </ReadingColumn>
  );
}
