import type { DiagnosticRecord, Session } from '@claudepad/schema'
import { Clock, Cpu, FolderOpen, Info } from 'lucide-react'
import type { TopBarContent } from '../components/shell/TopBar'
import { ViewSwitch, type ViewMode } from '../components/shell/ViewSwitch'
import { Badge } from '../components/ui/Badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip'
import { PlayToggleButton } from '../playback'
import { ShareButton } from '../share'
import { EventFilterControl, ExpandControl, SecretsControl } from '../viewer'
import { formatAbsolute, formatRelative } from '../viewer/format'

// The unified top bar's contents for a loaded session (D-49): breadcrumbs +
// labels/actions on line 1, model/folder/time + view switch on line 2. This is
// the single home for what used to be the naked topbar, the LoadedBanner, and the
// viewer's SessionHeader.
export function sessionTopBar(args: {
  session: Session
  diagnostics: DiagnosticRecord[]
  fileName?: string
  viewMode: ViewMode
  onViewMode: (mode: ViewMode) => void
  onHome: () => void
}): TopBarContent {
  const { session, diagnostics, fileName, viewMode, onViewMode, onHome } = args
  const title = session.meta.title ?? fileName ?? 'Untitled session'
  return {
    crumbs: [{ label: title }],
    titleIsHeading: true,
    // The breadcrumb back button closes the session and returns to the start.
    onBack: onHome,
    labels: <SessionLabels diagnostics={diagnostics} />,
    // Secrets/Expand act on the prettified transcript, so they're hidden in raw view.
    actions: <SessionActions session={session} showViewerControls={viewMode === 'pretty'} />,
    meta: <SessionMetaLine session={session} />,
    viewSwitch: <ViewSwitch value={viewMode} onChange={onViewMode} />
  }
}

function SessionLabels({ diagnostics }: { diagnostics: DiagnosticRecord[] }) {
  const notes = diagnostics.length
  return (
    <>
      {notes > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge variant="outline" className="cursor-default border-transparent bg-warn/15 text-warn">
                <Info className="size-3" />
                {notes} {notes === 1 ? 'note' : 'notes'}
              </Badge>
            }
          />
          <TooltipContent>
            Parsed with caveats - {diagnostics[0]?.message ?? 'see diagnostics'}
            {notes > 1 ? ` (+${notes - 1} more)` : ''}
          </TooltipContent>
        </Tooltip>
      )}
      <Badge variant="outline" className="border-transparent bg-success/15 text-success">local only</Badge>
    </>
  )
}

function SessionActions({
  session,
  showViewerControls
}: {
  session: Session
  showViewerControls: boolean
}) {
  return (
    <>
      {showViewerControls && (
        <>
          <EventFilterControl />
          <SecretsControl />
          <ExpandControl />
        </>
      )}
      <PlayToggleButton />
      <ShareButton session={session} />
    </>
  )
}

function SessionMetaLine({ session }: { session: Session }) {
  const { meta } = session
  const started = formatAbsolute(meta.startedAt)
  const relative = formatRelative(meta.startedAt)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm text-muted-foreground">
      {meta.model && (
        <span className="inline-flex items-center gap-1">
          <Cpu className="size-3.5 text-accent" />
          <span className="font-mono text-code">{meta.model}</span>
        </span>
      )}
      {meta.cwd && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="truncate font-mono text-code">{meta.cwd}</span>
        </span>
      )}
      {started && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" />
          <span>{started}</span>
          {relative && <span>· {relative}</span>}
        </span>
      )}
    </div>
  )
}
