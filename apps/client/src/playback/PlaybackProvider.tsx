import * as React from 'react'
import type { Session } from '@/schema'
import {
  buildTimeline,
  resolveFrame,
  rowStartMs,
  stepTargetMs,
  type PlaybackMode,
  type Timeline,
  type PlaybackFrame
} from './buildTimeline'
import {
  DEFAULT_PACING,
  mergePacing,
  clamp,
  SPEEDS,
  type Speed,
  type PacingConfig,
  type AppearMode
} from './pacing'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { parsePlaybackParams } from './deepLink'
import { usePersistedState, readStored, writeStored } from '../lib/usePersistedState'
import { useEventFilter } from '../viewer/hooks/useEventFilter'

// Persisted transport preferences (mode/speed/appear/pacing). Playhead, active,
// and status are session-scoped and intentionally NOT persisted.
const KEY_MODE = 'claudepad.playback.mode'
const KEY_SPEED = 'claudepad.playback.speed'
const KEY_APPEAR = 'claudepad.playback.appear'
// Persist only the user-editable reading-speed knob, not the whole pacing object,
// so default-tuning changes to the other constants still take effect on reload.
const KEY_READING_SPEED = 'claudepad.playback.readingSpeed'

// The clock + transport state for PRD-08 playback. Owns a requestAnimationFrame
// loop that advances a single monotonic virtual playhead (FR-3); every revealed/
// active derivation is a pure function of (timeline, playhead) so scrubbing and
// speed changes are allocation-free (FR-20). No network, no crypto - it consumes
// the already-decrypted in-memory Session only (FR-18).

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended'

export interface PlaybackContextValue {
  /** A session with renderable rows is loaded (the Play affordance is enabled). */
  available: boolean
  /** The playback surface is mounted (transport bar shown, progressive reveal). */
  active: boolean
  status: PlaybackStatus
  mode: PlaybackMode
  speed: number
  appear: AppearMode
  playheadMs: number
  pacingConfig: PacingConfig
  timeline: Timeline | null
  frame: PlaybackFrame
  reducedMotion: boolean

  enter(): void
  exit(): void
  toggleActive(): void
  play(): void
  pause(): void
  toggle(): void
  seekMs(ms: number): void
  seekToRow(rowIndex: number): void
  step(dir: -1 | 1): void
  setSpeed(s: number): void
  setMode(m: PlaybackMode): void
  setAppear(a: AppearMode): void
  setPacing(p: Partial<PacingConfig>): void
}

const INERT_FRAME: PlaybackFrame = {
  revealedCount: 0,
  activeRowIndex: -1,
  segIndex: -1,
  fraction: 0,
  activeSegStartMs: 0,
  activeSegDwellMs: 0
}

const noop = () => {}

const INERT: PlaybackContextValue = {
  available: false,
  active: false,
  status: 'idle',
  mode: 'present',
  speed: 1,
  appear: 'instant',
  playheadMs: 0,
  pacingConfig: DEFAULT_PACING,
  timeline: null,
  frame: INERT_FRAME,
  reducedMotion: false,
  enter: noop,
  exit: noop,
  toggleActive: noop,
  play: noop,
  pause: noop,
  toggle: noop,
  seekMs: noop,
  seekToRow: noop,
  step: noop,
  setSpeed: noop,
  setMode: noop,
  setAppear: noop,
  setPacing: noop
}

const PlaybackContext = React.createContext<PlaybackContextValue>(INERT)

/** Always safe to call - returns an inert controller when no provider is mounted. */
export function usePlayback(): PlaybackContextValue {
  return React.useContext(PlaybackContext)
}

export function PlaybackProvider({
  session,
  children
}: {
  session: Session | null
  children: React.ReactNode
}) {
  const reducedMotion = usePrefersReducedMotion()

  const [active, setActive] = React.useState(false)
  const [status, setStatus] = React.useState<PlaybackStatus>('idle')
  const [mode, setModeState] = usePersistedState<PlaybackMode>(
    KEY_MODE,
    'present',
    (v) => v === 'present' || v === 'realtime'
  )
  const [speed, setSpeedState] = usePersistedState<number>(
    KEY_SPEED,
    1,
    (v) => typeof v === 'number' && SPEEDS.includes(v as Speed)
  )
  const [appear, setAppearState] = usePersistedState<AppearMode>(
    KEY_APPEAR,
    'type',
    (v) => v === 'instant' || v === 'type'
  )
  const [playheadMs, setPlayheadMs] = React.useState(0)
  const [pacingConfig, setPacingConfig] = React.useState<PacingConfig>(() =>
    mergePacing({
      readingSpeed: readStored<number>(
        KEY_READING_SPEED,
        DEFAULT_PACING.readingSpeed,
        (v) => typeof v === 'number'
      )
    })
  )
  React.useEffect(
    () => writeStored(KEY_READING_SPEED, pacingConfig.readingSpeed),
    [pacingConfig.readingSpeed]
  )

  const { visibility } = useEventFilter()
  const timeline = React.useMemo(
    () => (session ? buildTimeline(session, mode, pacingConfig, visibility) : null),
    [session, mode, pacingConfig, visibility]
  )
  const totalMs = timeline?.totalMs ?? 0
  const available = (timeline?.rowCount ?? 0) > 0
  const frame = React.useMemo(
    () => (timeline ? resolveFrame(timeline, playheadMs) : INERT_FRAME),
    [timeline, playheadMs]
  )

  // Mirror the moving parts in refs so the rAF loop reads fresh values without
  // restarting (speed changes stay continuous, FR-5) and seeks avoid stale state.
  const playheadRef = React.useRef(0)
  const speedRef = React.useRef(speed)
  const totalRef = React.useRef(totalMs)
  React.useEffect(() => void (speedRef.current = speed), [speed])
  React.useEffect(() => void (totalRef.current = totalMs), [totalMs])

  const setPlayhead = React.useCallback((ms: number) => {
    const clamped = clamp(ms, 0, totalRef.current)
    playheadRef.current = clamped
    setPlayheadMs(clamped)
  }, [])

  // The clock: advance the playhead by Δframe × speed while playing (FR-3).
  React.useEffect(() => {
    if (status !== 'playing') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const next = playheadRef.current + dt * speedRef.current
      if (next >= totalRef.current) {
        setPlayhead(totalRef.current)
        setStatus('ended') // auto-pause at the end, no loop
        return
      }
      setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, setPlayhead])

  // Reset when the session changes (or clears).
  React.useEffect(() => {
    setActive(false)
    setStatus('idle')
    setPlayhead(0)
  }, [session, setPlayhead])

  const play = React.useCallback(() => {
    if (playheadRef.current >= totalRef.current) setPlayhead(0) // restart from end
    setStatus('playing')
  }, [setPlayhead])
  const pause = React.useCallback(() => setStatus('paused'), [])
  const toggle = React.useCallback(
    () => setStatus((s) => (s === 'playing' ? 'paused' : 'playing')),
    []
  )

  const enter = React.useCallback(() => {
    if (!available) return
    setActive(true)
    setPlayhead(0)
    setStatus('playing')
  }, [available, setPlayhead])
  const exit = React.useCallback(() => {
    setActive(false)
    setStatus('idle')
  }, [])
  const toggleActive = React.useCallback(() => {
    setActive((a) => {
      if (a) {
        setStatus('idle')
        return false
      }
      if (!available) return false
      setPlayhead(0)
      setStatus('playing')
      return true
    })
  }, [available, setPlayhead])

  const seekMs = React.useCallback(
    (ms: number) => {
      setPlayhead(ms)
      setStatus((s) => (s === 'ended' && ms < totalRef.current ? 'paused' : s))
    },
    [setPlayhead]
  )
  const seekToRow = React.useCallback(
    (rowIndex: number) => {
      if (timeline) seekMs(rowStartMs(timeline, rowIndex))
    },
    [timeline, seekMs]
  )
  const step = React.useCallback(
    (dir: -1 | 1) => {
      if (timeline) seekMs(stepTargetMs(timeline, playheadRef.current, dir))
    },
    [timeline, seekMs]
  )

  const setSpeed = React.useCallback((s: number) => setSpeedState(s), [])
  const setMode = React.useCallback((m: PlaybackMode) => setModeState(m), [])
  const setAppear = React.useCallback((a: AppearMode) => setAppearState(a), [])
  const setPacing = React.useCallback(
    (p: Partial<PacingConfig>) => setPacingConfig((prev) => mergePacing({ ...prev, ...p })),
    []
  )

  // Deep-link: open straight into playback at a given mode/speed (FR §7), once,
  // when a session first becomes available. Query string only - never the fragment.
  const deepLinkDone = React.useRef(false)
  React.useEffect(() => {
    if (deepLinkDone.current || !available || typeof window === 'undefined') return
    deepLinkDone.current = true
    const params = parsePlaybackParams(window.location.search)
    if (!params.play) return
    if (params.mode) setModeState(params.mode)
    if (params.speed) setSpeedState(params.speed)
    if (params.appear) setAppearState(params.appear)
    if (params.readingSpeed) setPacingConfig(mergePacing({ readingSpeed: params.readingSpeed }))
    setActive(true)
    setPlayhead(0)
    setStatus('playing')
  }, [available, setPlayhead])

  const value = React.useMemo<PlaybackContextValue>(
    () => ({
      available,
      active,
      status,
      mode,
      speed,
      appear,
      playheadMs,
      pacingConfig,
      timeline,
      frame,
      reducedMotion,
      enter,
      exit,
      toggleActive,
      play,
      pause,
      toggle,
      seekMs,
      seekToRow,
      step,
      setSpeed,
      setMode,
      setAppear,
      setPacing
    }),
    [
      available, active, status, mode, speed, appear, playheadMs, pacingConfig, timeline,
      frame, reducedMotion, enter, exit, toggleActive, play, pause, toggle, seekMs,
      seekToRow, step, setSpeed, setMode, setAppear, setPacing
    ]
  )

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
}
