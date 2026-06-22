import { formatBytes } from '@claudepad/ingest'
import {
  AlertTriangle,
  ChevronRight,
  Code2,
  FileText,
  Folder,
  FolderInput,
  Loader2,
  PanelLeftClose,
  RefreshCw,
  Unlink
} from 'lucide-react'
import * as React from 'react'
import {
  formatRelativeTime,
  type Vault,
  type VaultProject,
  type VaultSession
} from '../../fs'
import { IdentityControl } from '../../identity'
import { cn } from '../../lib/cn'
import { Wordmark } from '../brand/Wordmark'
import { Button } from '../ui/Button'

export interface RecentItem { id: string; title: string }

/** What the sidebar needs from the connected ~/.claude folder. */
export type VaultNav = Vault & {
  activeSessionId?: string
  onSelectSession: (session: VaultSession) => void
}

interface SidebarProps {
  recent: RecentItem[]
  activeId?: string
  onSelect?: (id: string) => void
  /** Collapse the sidebar (desktop); omitted in the mobile drawer. */
  onCollapse?: () => void
  /** current hash route, to mark the gallery link active */
  route: string
  /** Folder-backed navigation (Chromium only); falls back to `recent` when absent. */
  vault?: VaultNav
  className?: string
}

// Session-centric sidebar (PRD-01 §4.1): wordmark, primary New/Open, then either
// the connected ~/.claude folder tree (Chromium) or the recent list (fallback),
// and an identity/self-host footer.
export function Sidebar({
  recent,
  activeId,
  onSelect,
  onCollapse,
  route,
  vault,
  className
}: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full w-[260px] flex-col bg-sidebar border-r border-border',
        className
      )}
      aria-label="Sessions"
    >
      <div className="px-3 h-14 flex items-center gap-1">
        <a
          href="#/"
          className="mr-auto flex items-center rounded-md"
          aria-label="claudepad home"
        >
          <Wordmark size="full" />
        </a>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>

      {vault ? (
        <VaultTree vault={vault} />
      ) : (
        <RecentList recent={recent} activeId={activeId} onSelect={onSelect} />
      )}

      <SidebarFooter route={route} />
    </nav>
  )
}

function RecentList({
  recent,
  activeId,
  onSelect
}: Pick<SidebarProps, 'recent' | 'activeId' | 'onSelect'>) {
  return (
    <>
      <div className="px-3 pt-2">
        <p className="px-2 text-label uppercase tracking-[0.02em] text-muted-foreground">Recent</p>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {recent.length === 0 && (
          <li className="px-3 py-2 text-body-sm text-muted-foreground">No recent sessions yet.</li>
        )}
        {recent.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect?.(item.id)}
              className={cn(
                'relative w-full rounded-md px-3 py-2 text-left text-body-sm text-text',
                'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
                'hover:bg-accent-tint',
                item.id === activeId && 'bg-accent-tint font-medium'
              )}
            >
              {item.id === activeId && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
              )}
              <span className="line-clamp-1">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function VaultTree({ vault }: { vault: VaultNav }) {
  return (
    <>
      <div className="px-3 pt-2 flex items-center justify-between">
        <p className="px-2 text-label uppercase tracking-[0.02em] text-muted-foreground">Projects</p>
        {vault.status === 'connected' && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => void vault.refresh()}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent-tint hover:text-text transition-colors"
              aria-label="Rescan folder"
              title="Rescan folder"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void vault.disconnect()}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent-tint hover:text-text transition-colors"
              aria-label="Unlink folder"
              title="Unlink folder"
            >
              <Unlink className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <VaultBody vault={vault} />
      </div>
    </>
  )
}

function VaultBody({ vault }: { vault: VaultNav }) {
  switch (vault.status) {
    case 'restoring':
      return <Hint icon={<Loader2 className="size-4 animate-spin" />}>Reconnecting…</Hint>

    case 'connecting':
      return <Hint icon={<Loader2 className="size-4 animate-spin" />}>Reading folder…</Hint>

    case 'idle':
      return (
        <ConnectCard
          onConnect={() => void vault.connect()}
          label="Connect ~/.claude"
          blurb="Browse and open sessions straight from disk - granted once, read-only, never uploaded."
        />
      )

    case 'needs-permission':
      return (
        <ConnectCard
          onConnect={() => void vault.reconnect()}
          label="Reconnect folder"
          blurb="Your earlier grant lapsed - one click restores access."
        />
      )

    case 'error':
      return (
        <div className="px-2 py-2 space-y-2">
          <Hint icon={<AlertTriangle className="size-4 text-warn" />}>
            {vault.error ?? 'Could not read the folder.'}
          </Hint>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void vault.reconnect()}
          >
            Try again
          </Button>
        </div>
      )

    case 'connected':
      if (vault.projects.length === 0) {
        return <Hint>No sessions found in this folder.</Hint>
      }
      return (
        <ul className="space-y-0.5">
          {vault.projects.map((project, i) => (
            <ProjectRow
              key={project.id}
              project={project}
              defaultOpen={i === 0}
              activeSessionId={vault.activeSessionId}
              onSelectSession={vault.onSelectSession}
            />
          ))}
        </ul>
      )

    default:
      return null
  }
}

/** `vscode://file/<abs-path>` deep link that the OS hands to VS Code. */
function vscodeUrl(path: string): string {
  const abs = path.startsWith('/') ? path : `/${path}`
  return `vscode://file${encodeURI(abs)}`
}

/** Hover-revealed "open this folder in VS Code" affordance. The caller supplies
 * the `group-hover/*` variant matching its row's hover group. */
function LaunchInEditor({ path, className }: { path?: string; className?: string }) {
  if (!path) return null
  return (
    <a
      href={vscodeUrl(path)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:text-accent focus-visible:opacity-100',
        className
      )}
      aria-label="Open in VS Code"
      title="Open in VS Code"
    >
      <Code2 className="size-3.5" />
    </a>
  )
}

function ProjectRow({
  project,
  defaultOpen,
  activeSessionId,
  onSelectSession
}: {
  project: VaultProject
  defaultOpen: boolean
  activeSessionId?: string
  onSelectSession: (session: VaultSession) => void
}) {
  const hasActive = project.sessions.some((s) => s.id === activeSessionId)
  const [open, setOpen] = React.useState(defaultOpen || hasActive)

  return (
    <li>
      <div className="group/proj flex items-center rounded-md hover:bg-accent-tint transition-colors pr-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm text-text"
          aria-expanded={open}
          title={project.path}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="line-clamp-1 flex-1 font-medium">{project.label}</span>
        </button>
        <LaunchInEditor path={project.path} className="group-hover/proj:opacity-100" />
        <span className="text-label text-muted-foreground tabular-nums">
          {project.sessions.length}
        </span>
      </div>

      {open && (
        <ul className="ml-3 border-l border-border pl-1 py-0.5 space-y-0.5">
          {project.sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              active={session.id === activeSessionId}
              onSelect={onSelectSession}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function SessionRow({
  session,
  active,
  onSelect
}: {
  session: VaultSession
  active: boolean
  onSelect: (session: VaultSession) => void
}) {
  return (
    <li>
      <div
        className={cn(
          'group/sess relative flex items-center rounded-md transition-colors hover:bg-accent-tint',
          active && 'bg-accent-tint'
        )}
      >
        {active && (
          <span className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
        )}
        <button
          type="button"
          onClick={() => onSelect(session)}
          className="relative flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-2 py-1.5 text-left"
          title={session.fileName}
        >
          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'mb-[3px] block truncate text-body-sm leading-[18px] text-text',
                active && 'font-medium'
              )}
              title={session.title}
            >
              {session.title}
            </span>
            <span className="block truncate text-label text-muted-foreground">
              {formatRelativeTime(session.lastModified)}
              {session.branch && ` · ${session.branch}`} · {formatBytes(session.size)}
            </span>
          </span>
        </button>
      </div>
    </li>
  )
}

function ConnectCard({
  onConnect,
  label,
  blurb
}: {
  onConnect: () => void
  label: string
  blurb: string
}) {
  return (
    <div className="px-1 py-1 space-y-2">
      <Button
        variant="secondary"
        size='default'
        className="w-full justify-start"
        onClick={onConnect}
      >
        <FolderInput />
        {label}
      </Button>
      <p className="px-1 text-label leading-relaxed text-muted-foreground">{blurb}</p>
    </div>
  )
}

function Hint({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-body-sm text-muted-foreground">
      {icon}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

function SidebarFooter({ route }: { route: string }) {
  return (
    <div className="px-2 py-2 border-t border-border flex flex-col gap-0.5">
      {/* <a
        href="#/gallery"
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-body-sm text-muted-foreground',
          'transition-colors hover:bg-accent-tint hover:text-text',
          route === '#/gallery' && 'bg-accent-tint text-text'
        )}
      >
        <Palette className="size-4" />
        Gallery
      </a> */}
      <IdentityControl />
    </div>
  )
}
