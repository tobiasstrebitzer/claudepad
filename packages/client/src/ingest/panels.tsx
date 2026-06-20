import { AlertTriangle, FileWarning, RotateCcw } from 'lucide-react';
import { ReadingColumn } from '../components/shell/AppShell';
import { Button } from '../components/ui/button';
import { formatBytes } from '@claudepad/ingest';

// Friendly, non-crashing ingest outcomes (PRD-04 §4.6, FR-6/FR-16).

function Panel({
  icon,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <ReadingColumn>
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 text-warn">{icon}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-heading-3 font-semibold text-text">{title}</h2>
            <div className="mt-1 text-body-sm text-muted">{children}</div>
            <div className="mt-4 flex gap-2">{actions}</div>
          </div>
        </div>
      </div>
    </ReadingColumn>
  );
}

export function RejectionPanel({
  reason,
  onRetry,
}: {
  reason: string;
  onRetry: () => void;
}) {
  return (
    <Panel
      icon={<AlertTriangle className="size-5" />}
      title="That doesn’t look like a Claude Code session"
      actions={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw />
          Try again
        </Button>
      }
    >
      <p>{reason}</p>
      <p className="mt-1">
        Expected a <code className="font-mono text-code">.jsonl</code> file from{' '}
        <code className="font-mono text-code">~/.claude/projects/…</code>
      </p>
    </Panel>
  );
}

export function OversizePanel({
  bytes,
  onContinue,
  onCancel,
}: {
  bytes: number;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <Panel
      icon={<FileWarning className="size-5" />}
      title="That’s a large session"
      actions={
        <>
          <Button variant="primary" onClick={onContinue}>
            Continue anyway
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
    >
      <p>
        This file is {formatBytes(bytes)}. Parsing it may take a moment and use more
        memory. Continue?
      </p>
    </Panel>
  );
}

export function TooLargePanel({
  bytes,
  onRetry,
}: {
  bytes: number;
  onRetry: () => void;
}) {
  return (
    <Panel
      icon={<FileWarning className="size-5" />}
      title="That session is too large"
      actions={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw />
          Try another
        </Button>
      }
    >
      <p>
        This file is {formatBytes(bytes)}, over the 100 MB limit. Try trimming or
        splitting the session.
      </p>
    </Panel>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Panel
      icon={<AlertTriangle className="size-5" />}
      title="Couldn’t read this session"
      actions={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw />
          Try again
        </Button>
      }
    >
      <p>{message}</p>
    </Panel>
  );
}
