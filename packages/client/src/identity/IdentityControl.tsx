// The identity affordance in the sidebar footer (replaces the old hardcoded
// "self-host" stub). One click opens the full panel in a popover - frictionless:
// the identity is always one reach away, never its own page. The trigger reflects
// the current state (none / locked / signed-in) at a glance.

import { KeyRound, UserPlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { cn } from '../lib/cn';
import { IdentityPanel } from './IdentityPanel';
import { useIdentityContext } from './IdentityProvider';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function IdentityControl() {
  const { state } = useIdentityContext();

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left',
          'transition-colors hover:bg-accent-tint focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Trigger state={state} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="max-h-[80vh] w-[320px] overflow-y-auto"
      >
        <IdentityPanel />
      </PopoverContent>
    </Popover>
  );
}

function Trigger({
  state,
}: {
  state: ReturnType<typeof useIdentityContext>['state'];
}) {
  if (state.status === 'unlocked') {
    return (
      <>
        <Avatar>{initials(state.identity.name)}</Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-body-sm text-text">{state.identity.name}</span>
          <span className="text-label text-muted">
            {state.protected ? 'protected' : 'signed in'}
          </span>
        </span>
      </>
    );
  }
  if (state.status === 'locked') {
    return (
      <>
        <Avatar muted>
          <KeyRound className="size-3.5" />
        </Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-body-sm text-text">{state.name}</span>
          <span className="text-label text-muted">locked</span>
        </span>
      </>
    );
  }
  // none / loading
  return (
    <>
      <Avatar muted>
        <UserPlus className="size-3.5" />
      </Avatar>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-body-sm text-text">Set up your identity</span>
        <span className="text-label text-muted">mint or import a key</span>
      </span>
    </>
  );
}

function Avatar({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full text-label font-semibold',
        muted ? 'bg-accent-tint text-muted' : 'bg-accent text-accent-fg',
      )}
    >
      {children}
    </span>
  );
}
