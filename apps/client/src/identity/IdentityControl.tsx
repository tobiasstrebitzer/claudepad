// The single "you" affordance in the sidebar footer: your identity AND how
// you're reachable (the optional registry), unified into one item. One click
// opens a modal with both - identity first (who you are), registry second (an
// opt-in directory so people can share with you by name). The trigger reflects
// the current identity state (none / locked / signed-in) at a glance.

import { KeyRound, UserPlus } from 'lucide-react'
import { RegistryPanel } from '../registry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '../components/ui/Dialog'
import { cn } from '../lib/cn'
import { IdentityPanel } from './IdentityPanel'
import { useIdentityContext } from './IdentityProvider'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function IdentityControl() {
  const { state } = useIdentityContext()

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left',
          'transition-colors hover:bg-accent-tint focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <Trigger state={state} />
      </DialogTrigger>
      <DialogContent className="grid-cols-1 max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-md">
        <DialogTitle className="sr-only">Your identity and registry</DialogTitle>
        <DialogDescription className="sr-only">
          Manage the keypair you share with, and the optional registry that lets people
          reach you by name.
        </DialogDescription>
        <IdentityPanel />
        <div className="mt-6 border-t border-border pt-5">
          <RegistryPanel />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Trigger({
  state
}: {
  state: ReturnType<typeof useIdentityContext>['state']
}) {
  if (state.status === 'unlocked') {
    return (
      <>
        <Avatar>{initials(state.identity.name)}</Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-body-sm text-text">{state.identity.name}</span>
          <span className="text-label text-muted-foreground">
            {state.protected ? 'protected' : 'signed in'}
          </span>
        </span>
      </>
    )
  }
  if (state.status === 'locked') {
    return (
      <>
        <Avatar muted>
          <KeyRound className="size-3.5" />
        </Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-body-sm text-text">{state.name}</span>
          <span className="text-label text-muted-foreground">locked</span>
        </span>
      </>
    )
  }
  // none / loading
  return (
    <>
      <Avatar muted>
        <UserPlus className="size-3.5" />
      </Avatar>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-body-sm text-text">Set up your identity</span>
        <span className="text-label text-muted-foreground">mint or import a key</span>
      </span>
    </>
  )
}

function Avatar({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full text-label font-semibold',
        muted ? 'bg-accent-tint text-muted-foreground' : 'bg-accent text-accent-fg'
      )}
    >
      {children}
    </span>
  )
}
