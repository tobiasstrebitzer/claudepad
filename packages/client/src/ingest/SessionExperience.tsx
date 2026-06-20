import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { ReadingColumn } from '../components/shell/AppShell';
import { SessionViewer, demoSession, demoSecretMap } from '../viewer';
import { useSession } from './useSession';
import { usePasteCapture } from './usePasteCapture';
import { EmptyState } from './EmptyState';
import { LoadedBanner } from './LoadedBanner';
import { RejectionPanel, OversizePanel, TooLargePanel, ErrorPanel } from './panels';

// The P1 (MVP-0) experience: drop/paste a session → see it beautifully, fully
// offline. Local-only by default; sharing is a separate P3 action. This composes
// the PRD-04 ingest surfaces with the PRD-03 viewer.
export function SessionExperience({
  onAnchorChange,
}: {
  onAnchorChange?: (id: string) => void;
}) {
  const api = useSession();
  const [note, setNote] = React.useState<string | null>(null);

  // Capture window pastes only when there's nothing loaded yet (FR-5).
  const pasteEnabled =
    api.state.status === 'idle' ||
    api.state.status === 'rejected' ||
    api.state.status === 'error';
  usePasteCapture(pasteEnabled, (text) => void api.loadText(text, 'paste'));

  const onMultiple = (count: number) =>
    setNote(`Loaded the first of ${count} files — one session is shown at a time.`);

  switch (api.state.status) {
    case 'idle':
      return (
        <>
          <EmptyState
            onFile={(f) => void api.loadFile(f, 'drop')}
            onMultiple={onMultiple}
          />
          <ReadingColumn className="!pt-0">
            {note && <p className="mb-4 text-body-sm text-warn">{note}</p>}
            <button
              type="button"
              onClick={() => api.showSession(demoSession, 'sample-session.jsonl')}
              className="inline-flex items-center gap-1.5 text-body-sm text-accent hover:underline"
            >
              <Sparkles className="size-4" />
              Or explore a sample session
            </button>
          </ReadingColumn>
        </>
      );

    case 'parsing':
      return (
        <ReadingColumn>
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-2/3" />
          </div>
        </ReadingColumn>
      );

    case 'loaded': {
      const isDemo = api.state.fileName === 'sample-session.jsonl';
      return (
        <div className="flex h-full flex-col">
          <LoadedBanner
            session={api.state.session}
            diagnostics={api.state.diagnostics}
            fileName={api.state.fileName}
            onClear={api.clear}
          />
          <div className="min-h-0 flex-1">
            <SessionViewer
              session={api.state.session}
              secretMap={isDemo ? demoSecretMap : undefined}
              options={{ onAnchorChange }}
            />
          </div>
        </div>
      );
    }

    case 'rejected':
      return <RejectionPanel reason={api.state.reason} onRetry={api.clear} />;

    case 'oversize':
      return (
        <OversizePanel
          bytes={api.state.bytes}
          onContinue={() => void api.confirmOversize()}
          onCancel={api.clear}
        />
      );

    case 'too-large':
      return <TooLargePanel bytes={api.state.bytes} onRetry={api.clear} />;

    case 'error':
      return <ErrorPanel message={api.state.message} onRetry={api.clear} />;
  }
}
