import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Skeleton } from '../components/ui/Skeleton'
import { ReadingColumn } from '../components/shell/AppShell'
import type { ViewMode } from '../components/shell/ViewSwitch'
import { SessionViewer, RawSessionView, demoSession } from '../viewer'
import { type SessionApi } from './useSession'
import { usePasteCapture } from './usePasteCapture'
import { EmptyState } from './EmptyState'
import { RejectionPanel, OversizePanel, TooLargePanel, ErrorPanel } from './panels'

// The P1 (MVP-0) experience body: drop/paste a session → see it beautifully, fully
// offline. The session's chrome (title, meta, actions, view switch) lives in the
// unified top bar (D-49); this renders only the canvas below it.
export function SessionExperience({
  api,
  viewMode,
  onAnchorChange
}: {
  api: SessionApi
  viewMode: ViewMode
  onAnchorChange?: (id: string) => void
}) {
  const [note, setNote] = React.useState<string | null>(null)

  // Capture window pastes only when there's nothing loaded yet (FR-5).
  const pasteEnabled =
    api.state.status === 'idle' ||
    api.state.status === 'rejected' ||
    api.state.status === 'error'
  usePasteCapture(pasteEnabled, (text) => void api.loadText(text, 'paste'))

  const onMultiple = (count: number) =>
    setNote(`Loaded the first of ${count} files - one session is shown at a time.`)

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
      )

    case 'parsing':
      return (
        <ReadingColumn>
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-2/3" />
          </div>
        </ReadingColumn>
      )

    case 'loaded':
      return viewMode === 'raw' ? (
        <RawSessionView session={api.state.session} />
      ) : (
        <SessionViewer session={api.state.session} options={{ onAnchorChange }} />
      )

    case 'rejected':
      return <RejectionPanel reason={api.state.reason} onRetry={api.clear} />

    case 'oversize':
      return (
        <OversizePanel
          bytes={api.state.bytes}
          onContinue={() => void api.confirmOversize()}
          onCancel={api.clear}
        />
      )

    case 'too-large':
      return <TooLargePanel bytes={api.state.bytes} onRetry={api.clear} />

    case 'error':
      return <ErrorPanel message={api.state.message} onRetry={api.clear} />
  }
}
