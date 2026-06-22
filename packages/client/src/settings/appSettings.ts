// App-level preferences (non-sensitive, localStorage-backed) with live cross-
// component sync via useSyncExternalStore - so toggling a setting in the menu is
// reflected the next time the share flow reads it. Mirrors lib/theme.ts's
// global-store-with-listeners shape.

import * as React from 'react'

export interface AppSettings {
  /** Require an out-of-band fingerprint match before a recipient is added. */
  requireFingerprintConfirm: boolean
  /** Show the secret-review step when sharing body-only (strip mode). */
  requireSecretReview: boolean
}

const STORAGE_KEY = 'claudepad.settings'
const DEFAULTS: AppSettings = { requireFingerprintConfirm: true, requireSecretReview: true }

function read(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<AppSettings>
    return {
      requireFingerprintConfirm:
        typeof p.requireFingerprintConfirm === 'boolean'
          ? p.requireFingerprintConfirm
          : DEFAULTS.requireFingerprintConfirm,
      requireSecretReview:
        typeof p.requireSecretReview === 'boolean'
          ? p.requireSecretReview
          : DEFAULTS.requireSecretReview
    }
  } catch {
    return DEFAULTS
  }
}

let current: AppSettings = read()
const listeners = new Set<() => void>()

export function getAppSettings(): AppSettings {
  return current
}

export function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  current = { ...current, [key]: value }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore persistence failures (SSR/private mode) */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppSettings(): AppSettings {
  return React.useSyncExternalStore(subscribe, getAppSettings, getAppSettings)
}
