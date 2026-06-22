// First-launch onboarding: opens the wizard once, then never again unless the
// user re-runs it from the sidebar. "Seen it" is a persisted flag set whenever
// the wizard closes (finished or skipped), so it's truly first-launch-only.

import * as React from 'react'
import { usePersistedState } from '../lib/usePersistedState'
import { OnboardingWizard } from './OnboardingWizard'

const STORAGE_KEY = 'claudepad.onboarded'

export interface OnboardingApi {
  /** Re-open the wizard (e.g. from a "Take the tour" menu item). */
  start: () => void
}

const OnboardingContext = React.createContext<OnboardingApi | null>(null)

export function useOnboarding(): OnboardingApi {
  const ctx = React.useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider')
  return ctx
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboarded, setOnboarded] = usePersistedState<boolean>(
    STORAGE_KEY,
    false,
    (v) => typeof v === 'boolean'
  )
  const [open, setOpen] = React.useState(false)

  // Auto-open exactly once on a first launch (no persisted flag yet).
  const checked = React.useRef(false)
  React.useEffect(() => {
    if (checked.current) return
    checked.current = true
    if (!onboarded) setOpen(true)
  }, [onboarded])

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      // Closing for any reason (done or dismissed) means "don't auto-show again".
      if (!next) setOnboarded(true)
    },
    [setOnboarded]
  )

  const api = React.useMemo<OnboardingApi>(() => ({ start: () => setOpen(true) }), [])

  return (
    <OnboardingContext.Provider value={api}>
      {children}
      <OnboardingWizard open={open} onOpenChange={onOpenChange} />
    </OnboardingContext.Provider>
  )
}
