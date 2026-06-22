// The sidebar-footer entry to re-run the onboarding wizard after first launch.

import { Compass } from 'lucide-react'
import { cn } from '../lib/cn'
import { useOnboarding } from './OnboardingProvider'

export function OnboardingControl() {
  const { start } = useOnboarding()
  return (
    <button
      type="button"
      onClick={start}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body-sm text-muted-foreground',
        'transition-colors hover:bg-accent-tint hover:text-text focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center">
        <Compass className="size-4" />
      </span>
      Take the tour
    </button>
  )
}
