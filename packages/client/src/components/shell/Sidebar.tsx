import * as React from 'react';
import {
  PanelLeftClose,
  Unlink,
  Palette,
  Folder,
  FileText,
  FolderInput,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { formatBytes } from '@claudepad/ingest';
import { cn } from '../../lib/cn';
import { Wordmark } from '../brand/Wordmark';
import { Button } from '../ui/button';
import { IdentityControl } from '../../identity';
import {
  formatRelativeTime,
  type Vault,
  type VaultProject,
  type VaultSession,
} from '../../fs';

export type RecentItem = { id: string; title: string };

/** What the sidebar needs from the connected ~/.claude folder. */
export type VaultNav = Vault & {
  activeSessionId?: string;
  onSelectSession: (session: VaultSession) => void;
};

type SidebarProps = {
  recent: RecentItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Collapse the sidebar (desktop); omitted in the mobile drawer. */
  onCollapse?: () => void;
  /** current hash route, to mark the gallery link active */
  route: string;
  /** Folder-backed navigation (Chromium only); falls back to `recent` when absent. */
  vault?: VaultNav;
  className?: string;
};

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
  className,
}: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full w-[260px] flex-col bg-sidebar border-r border-border',
        className,
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
  );
}

function RecentList({
  recent,
  activeId,
  onSelect,
}: Pick<SidebarProps, 'recent' | 'activeId' | 'onSelect'>) {
  return (
    <>
      <div className="px-3 pt-2">
        <p className="px-2 text-label uppercase tracking-[0.02em] text-muted">Recent</p>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {recent.length === 0 && (
          <li className="px-3 py-2 text-body-sm text-muted">No recent sessions yet.</li>
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
                item.id === activeId && 'bg-accent-tint font-medium',
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
  );
}

function VaultTree({ vault }: { vault: VaultNav }) {
  return (
    <>
      <div className="px-3 pt-2 flex items-center justify-between">
        <p className="px-2 text-label uppercase tracking-[0.02em] text-muted">Projects</p>
        {vault.status === 'connected' && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => void vault.refresh()}
              className="grid size-6 place-items-center rounded-md text-muted hover:bg-accent-tint hover:text-text transition-colors"
              aria-label="Rescan folder"
              title="Rescan folder"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void vault.disconnect()}
              className="grid size-6 place-items-center rounded-md text-muted hover:bg-accent-tint hover:text-text transition-colors"
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
  );
}

function VaultBody({ vault }: { vault: VaultNav }) {
  switch (vault.status) {
    case 'restoring':
      return <Hint icon={<Loader2 className="size-4 animate-spin" />}>Reconnecting…</Hint>;

    case 'connecting':
      return <Hint icon={<Loader2 className="size-4 animate-spin" />}>Reading folder…</Hint>;

    case 'idle':
      return (
        <ConnectCard
          onConnect={() => void vault.connect()}
          label="Connect ~/.claude"
          blurb="Browse and open sessions straight from disk - granted once, read-only, never uploaded."
        />
      );

    case 'needs-permission':
      return (
        <ConnectCard
          onConnect={() => void vault.reconnect()}
          label="Reconnect folder"
          blurb="Your earlier grant lapsed - one click restores access."
        />
      );

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
      );

    case 'connected':
      if (vault.projects.length === 0) {
        return <Hint>No sessions found in this folder.</Hint>;
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
      );

    default:
      return null;
  }
}

function ProjectRow({
  project,
  defaultOpen,
  activeSessionId,
  onSelectSession,
}: {
  project: VaultProject;
  defaultOpen: boolean;
  activeSessionId?: string;
  onSelectSession: (session: VaultSession) => void;
}) {
  const hasActive = project.sessions.some((s) => s.id === activeSessionId);
  const [open, setOpen] = React.useState(defaultOpen || hasActive);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm text-text hover:bg-accent-tint transition-colors"
        aria-expanded={open}
        title={project.path}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted transition-transform',
            open && 'rotate-90',
          )}
        />
        <Folder className="size-3.5 shrink-0 text-muted" />
        <span className="line-clamp-1 flex-1 font-medium">{project.label}</span>
        <span className="text-label text-muted tabular-nums">
          {project.sessions.length}
        </span>
      </button>

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
  );
}

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: VaultSession;
  active: boolean;
  onSelect: (session: VaultSession) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(session)}
        className={cn(
          'relative flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left',
          'transition-colors hover:bg-accent-tint',
          active && 'bg-accent-tint',
        )}
        title={session.fileName}
      >
        {active && (
          <span className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
        )}
        <FileText className="mt-0.5 size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'mb-[3px] block truncate text-body-sm leading-[18px] text-text',
              active && 'font-medium',
            )}
            title={session.title}
          >
            {session.title}
          </span>
          <span className="block truncate text-label text-muted">
            {formatRelativeTime(session.lastModified)}
            {session.branch && ` · ${session.branch}`} · {formatBytes(session.size)}
          </span>
        </span>
      </button>
    </li>
  );
}

function ConnectCard({
  onConnect,
  label,
  blurb,
}: {
  onConnect: () => void;
  label: string;
  blurb: string;
}) {
  return (
    <div className="px-1 py-1 space-y-2">
      <Button
        variant="secondary"
        size="md"
        className="w-full justify-start"
        onClick={onConnect}
      >
        <FolderInput />
        {label}
      </Button>
      <p className="px-1 text-label leading-relaxed text-muted">{blurb}</p>
    </div>
  );
}

function Hint({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-body-sm text-muted">
      {icon}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function SidebarFooter({ route }: { route: string }) {
  return (
    <div className="px-2 py-2 border-t border-border space-y-0.5">
      <a
        href="#/gallery"
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-body-sm text-muted',
          'transition-colors hover:bg-accent-tint hover:text-text',
          route === '#/gallery' && 'bg-accent-tint text-text',
        )}
      >
        <Palette className="size-4" />
        Gallery
      </a>
      <IdentityControl />
    </div>
  );
}
