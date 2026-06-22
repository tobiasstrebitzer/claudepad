import { Menu, PanelLeftOpen } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/cn'
import { usePersistedState } from '../../lib/usePersistedState'
import { Wordmark } from '../brand/Wordmark'
import { Button } from '../ui/Button'
import { Sidebar, type RecentItem, type VaultNav } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { TopBar, type TopBarContent } from './TopBar'

interface AppShellProps {
  recent: RecentItem[]
  activeId?: string
  onSelect?: (id: string) => void
  /** Folder-backed navigation (Chromium only). */
  vault?: VaultNav
  route: string
  /** The single top bar's contents (breadcrumbs + context + actions). */
  topbar?: TopBarContent
  /** Pinned below the scrolling canvas, inside the content column (e.g. the
   * playback transport bar) - sits right of the sidebar and never overlaps. */
  footer?: React.ReactNode
  children: React.ReactNode
}

// App shell (PRD-01 §4.1, FR-14/FR-15): sidebar + canvas on desktop; below md the
// sidebar collapses to an off-canvas drawer toggled from the topbar, canvas goes
// edge-to-edge with px-4 gutters.
export function AppShell({
  recent,
  activeId,
  onSelect,
  vault,
  route,
  topbar,
  footer,
  children
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  // Desktop sidebar starts hidden and remembers the user's choice across reloads.
  const [collapsed, setCollapsed] = usePersistedState(
    'claudepad.sidebar.collapsed',
    true,
    (v) => typeof v === 'boolean'
  )

  // Close the drawer on route change / Escape.
  React.useEffect(() => setDrawerOpen(false), [route])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {/* Desktop sidebar (collapsible) */}
      <aside className={cn('shrink-0', collapsed ? 'hidden' : 'hidden md:block')}>
        <Sidebar
          recent={recent}
          activeId={activeId}
          onSelect={onSelect}
          onCollapse={() => setCollapsed(true)}
          vault={vault}
          route={route}
        />
      </aside>

      {/* Mobile off-canvas drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-text/30"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-(--shadow-md)">
            <Sidebar
              recent={recent}
              activeId={activeId}
              onSelect={onSelect}
              vault={vault}
              route={route}
            />
          </div>
        </div>
      )}

      {/* Main canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          content={topbar}
          leading={
            <>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu />
              </Button>
              {/* On mobile the brand yields to the session's back-button + title
                  (onBack signals a loaded session); the hamburger still anchors nav. */}
              <span className={cn(topbar?.onBack ? 'hidden' : 'md:hidden')}>
                <Wordmark size="small" />
              </span>
              {collapsed && (
                <span className="hidden items-center gap-1 md:inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Expand sidebar"
                    title="Expand sidebar"
                    onClick={() => setCollapsed(false)}
                  >
                    <PanelLeftOpen />
                  </Button>
                  <a href="#/" className="rounded-md flex" aria-label="claudepad home">
                    <Wordmark size="small" />
                  </a>
                </span>
              )}
            </>
          }
          trailing={<ThemeToggle />}
        />

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        {footer}
      </div>
    </div>
  )
}

/** Centered reading column capped at max-w (FR-16). Reusable by PRD-03. */
export function ReadingColumn({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('mx-auto w-full max-w-reading px-4 py-10 md:px-6', className)}>
      {children}
    </div>
  )
}
