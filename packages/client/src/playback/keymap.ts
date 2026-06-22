import * as React from 'react'
import { SPEEDS, SEEK_STEP_MS } from './pacing'
import type { PlaybackContextValue } from './PlaybackProvider'

// Keyboard transport (PRD-08 FR-23). Bound globally while the playback surface
// is active, suppressed inside text inputs. Video-editor conventions (J/K/L)
// alongside the obvious Space / arrows / Home / End / Esc.

const cycleSpeed = (current: number, dir: -1 | 1): number => {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number])
  const base = i === -1 ? SPEEDS.indexOf(1 as (typeof SPEEDS)[number]) : i
  const next = Math.min(SPEEDS.length - 1, Math.max(0, base + dir))
  return SPEEDS[next]!
}

const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable
}

export function usePlaybackKeymap(
  api: PlaybackContextValue,
  onToggleHelp: () => void
): void {
  // Keep a fresh ref so the listener (bound once per active session) never goes stale.
  const ref = React.useRef({ api, onToggleHelp })
  ref.current = { api, onToggleHelp }

  React.useEffect(() => {
    if (!api.active) return
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const { api: a, onToggleHelp: help } = ref.current
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          a.toggle()
          break
        case 'l':
        case 'L':
          e.preventDefault()
          a.play()
          break
        case 'j':
        case 'J':
          e.preventDefault()
          a.seekMs(a.playheadMs - SEEK_STEP_MS * 2)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) a.step(-1)
          else a.seekMs(a.playheadMs - SEEK_STEP_MS)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) a.step(1)
          else a.seekMs(a.playheadMs + SEEK_STEP_MS)
          break
        case 'ArrowUp':
          e.preventDefault()
          a.setSpeed(cycleSpeed(a.speed, 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          a.setSpeed(cycleSpeed(a.speed, -1))
          break
        case 'Home':
          e.preventDefault()
          a.seekMs(0)
          break
        case 'End':
          e.preventDefault()
          a.seekMs(a.timeline?.totalMs ?? 0)
          break
        case 'Escape':
          e.preventDefault()
          a.exit()
          break
        case '?':
          e.preventDefault()
          help()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [api.active])
}

export { cycleSpeed }
