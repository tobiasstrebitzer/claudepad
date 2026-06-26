// @/usage - useUsageSettings.ts
// Local, persisted Usage Insights settings (PRD-13 FR-6/7/8): subscription
// amount + weighting, effort rate, and any pricing overrides. Stored via idbKv,
// same trust domain as the vault/identity stores - nothing leaves the browser.

import * as React from 'react'
import { createIdbKv } from '@/lib/idbKv'
import { DEFAULT_SETTINGS, type UsageSettings } from './derive'

// Separate DB from the aggregate cache (one store per database, per idbKv).
const kv = createIdbKv('claudepad-usage-settings', 'settings')
const KEY = 'settings'

export interface UsageSettingsApi {
  settings: UsageSettings
  ready: boolean
  update: (patch: Partial<UsageSettings>) => void
}

export function useUsageSettings(): UsageSettingsApi {
  const [settings, setSettings] = React.useState<UsageSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let live = true
    void kv.get<UsageSettings>(KEY).then((stored) => {
      if (!live) return
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...stored })
      setReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  const update = React.useCallback((patch: Partial<UsageSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void kv.set(KEY, next)
      return next
    })
  }, [])

  return { settings, ready, update }
}
