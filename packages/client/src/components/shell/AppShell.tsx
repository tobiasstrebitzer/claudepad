import * as React from 'react';
import { Menu, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Wordmark } from '../brand/Wordmark';
import { Button } from '../ui/button';
import { ThemeToggle } from './ThemeToggle';
import { TopBar, type TopBarContent } from './TopBar';
import { Sidebar, type RecentItem, type VaultNav } from './Sidebar';

type AppShellProps = {
  recent: RecentItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Trigger the single-session open flow (drop/paste/file-picker). */
  onOpen?: () => void;
  /** Folder-backed navigation (Chromium only). */
  vault?: VaultNav;
  route: string;
  /** The single top bar's contents (breadcrumbs + context + actions). */
  topbar?: TopBarContent;
  children: React.ReactNode;
};

// App shell (PRD-01 §4.1, FR-14/FR-15): sidebar + canvas on desktop; below md the
// sidebar collapses to an off-canvas drawer toggled from the topbar, canvas goes
// edge-to-edge with px-4 gutters.
export function AppShell({
  recent,
  activeId,
  onSelect,
  onOpen,
  vault,
  route,
  topbar,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // Close the drawer on route change / Escape.
  React.useEffect(() => setDrawerOpen(false), [route]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {/* Desktop sidebar (collapsible) */}
      <aside className={cn('shrink-0', collapsed ? 'hidden' : 'hidden md:block')}>
        <Sidebar
          recent={recent}
          activeId={activeId}
          onSelect={onSelect}
          onOpen={onOpen}
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
          <div className="absolute inset-y-0 left-0 shadow-[var(--shadow-md)]">
            <Sidebar
              recent={recent}
              activeId={activeId}
              onSelect={onSelect}
              onOpen={onOpen}
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
              <span className="md:hidden">
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
                  <a href="#/" className="rounded-md" aria-label="claudepad home">
                    <Wordmark size="small" />
                  </a>
                </span>
              )}
            </>
          }
          trailing={<ThemeToggle />}
        />

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/** Centered reading column capped at max-w (FR-16). Reusable by PRD-03. */
export function ReadingColumn({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-reading px-4 py-10 md:px-6', className)}>
      {children}
    </div>
  );
}
