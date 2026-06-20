import { Plus, Palette } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Wordmark } from '../brand/Wordmark';
import { Button } from '../ui/button';

export type RecentItem = { id: string; title: string };

type SidebarProps = {
  recent: RecentItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** current hash route, to mark the gallery link active */
  route: string;
  className?: string;
};

// Session-centric sidebar (PRD-01 §4.1): wordmark, primary New/Open, RECENT list
// (active item = 2px accent left-bar + faint tint), identity/self-host footer.
export function Sidebar({ recent, activeId, onSelect, route, className }: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full w-[260px] flex-col bg-sidebar border-r border-border',
        className,
      )}
      aria-label="Sessions"
    >
      <div className="px-4 h-14 flex items-center">
        <a href="#/" className="rounded-md" aria-label="claudepad home">
          <Wordmark size="full" />
        </a>
      </div>

      <div className="px-3 pb-3">
        <Button variant="secondary" size="md" className="w-full justify-start">
          <Plus />
          New / Open
        </Button>
      </div>

      <div className="px-3 pt-2">
        <p className="px-2 text-label uppercase tracking-[0.02em] text-muted">Recent</p>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {recent.length === 0 && (
          <li className="px-3 py-2 text-body-sm text-muted">No recent sessions yet.</li>
        )}
        {recent.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect?.(item.id)}
                className={cn(
                  'relative w-full rounded-md px-3 py-2 text-left text-body-sm text-text',
                  'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
                  'hover:bg-accent-tint',
                  active && 'bg-accent-tint font-medium',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
                )}
                <span className="line-clamp-1">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ul>

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
        <div className="flex items-center gap-2 rounded-md px-3 py-2">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-fg text-label font-semibold">
            TS
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-body-sm text-text">Tobias</span>
            <span className="text-label text-muted">self-host</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
