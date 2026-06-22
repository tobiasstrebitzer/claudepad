import {
  Clock,
  Keyboard,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  Type,
  X,
  Zap
} from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '../components/ui/Dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../components/ui/Popover'
import { cn } from '../lib/cn'
import { usePlayback, type PlaybackContextValue } from './PlaybackProvider'
import { Scrubber } from './Scrubber'
import { formatClock } from './format'
import { usePlaybackKeymap } from './keymap'
import { SPEEDS } from './pacing'

// The transport bar (PRD-08 §4.2), pinned below the scrolling canvas (inside the
// content column, right of the sidebar). All controls keyboard-operable
// (FR-22/23); restrained motion, token-driven surface. Pacing/speed/appear live
// behind a single settings popover.
export function TransportBar() {
  const pb = usePlayback()
  const [helpOpen, setHelpOpen] = React.useState(false)
  usePlaybackKeymap(pb, () => setHelpOpen((v) => !v))

  if (!pb.active || !pb.timeline) return null

  const playing = pb.status === 'playing'
  const ended = pb.status === 'ended'
  const totalMs = pb.timeline.totalMs

  return (
    <>
      <div
        className="shrink-0 border-t border-border bg-surface"
        role="group"
        aria-label="Playback transport"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          {/* left: transport */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Previous event"
              onClick={() => pb.step(-1)}
            >
              <SkipBack />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="size-9"
              aria-label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}
              onClick={() => (ended ? pb.play() : pb.toggle())}
            >
              {playing ? <Pause /> : ended ? <RotateCcw /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Next event"
              onClick={() => pb.step(1)}
            >
              <SkipForward />
            </Button>
          </div>

          {/* center: clock + scrubber */}
          <span className="shrink-0 font-mono text-label tabular-nums text-muted-foreground">
            {formatClock(pb.playheadMs)} / {formatClock(totalMs)}
          </span>
          <Scrubber
            timeline={pb.timeline}
            playheadMs={pb.playheadMs}
            fraction={pb.frame.fraction}
            activeRowIndex={pb.frame.activeRowIndex}
            onSeekFraction={(f) => pb.seekMs(f * totalMs)}
          />

          {/* right: settings + help + exit */}
          <SettingsPopover pb={pb} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Keyboard shortcuts"
            onClick={() => setHelpOpen(true)}
          >
            <Keyboard />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Exit playback"
            onClick={pb.exit}
          >
            <X />
          </Button>
        </div>
      </div>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  )
}

// A small segmented control built from buttons (token-driven, no new primitive).
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<{ value: T; label: React.ReactNode; title?: string }>
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-label uppercase tracking-[0.02em] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-body-sm transition-colors',
              o.value === value
                ? 'border-accent bg-accent-tint text-accent'
                : 'border-border text-text hover:bg-accent-tint'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SettingsPopover({ pb }: { pb: PlaybackContextValue }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 tabular-nums"
            aria-label="Playback settings"
          >
            <Settings />
            {pb.speed}×
          </Button>
        }
      />
      <PopoverContent align="end" side="top" className="w-64 space-y-3.5 p-3">
        <Segmented
          label="Pacing"
          value={pb.mode}
          onChange={pb.setMode}
          options={[
            {
              value: 'present',
              title: 'Auto-paced for an audience',
              label: (
                <>
                  <Presentation className="size-3.5" /> Presentation
                </>
              )
            },
            {
              value: 'realtime',
              title: 'Replay the actual gaps',
              label: (
                <>
                  <Clock className="size-3.5" /> Real-time
                </>
              )
            }
          ]}
        />

        <Segmented
          label="Speed"
          value={pb.speed}
          onChange={pb.setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />

        <Segmented
          label="Appear"
          value={pb.appear}
          onChange={pb.setAppear}
          options={[
            {
              value: 'instant',
              title: 'Turns appear all at once',
              label: (
                <>
                  <Zap className="size-3.5" /> Instant
                </>
              )
            },
            {
              value: 'type',
              title: 'Prose types out over each turn',
              label: (
                <>
                  <Type className="size-3.5" /> Type
                </>
              )
            }
          ]}
        />

        {pb.mode === 'present' && (
          <label className="flex flex-col gap-1 text-label text-muted-foreground">
            <span>Reading speed · {pb.pacingConfig.readingSpeed} ch/s</span>
            <input
              type="range"
              min={12}
              max={60}
              step={1}
              value={pb.pacingConfig.readingSpeed}
              onChange={(e) => pb.setPacing({ readingSpeed: Number(e.target.value) })}
              className="accent-accent"
              aria-label="Reading speed (characters per second)"
            />
          </label>
        )}
      </PopoverContent>
    </Popover>
  )
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space / K', 'Play / pause'],
  ['L / J', 'Play / rewind'],
  ['← / →', 'Seek ∓5s'],
  ['⇧← / ⇧→', 'Previous / next event'],
  ['↑ / ↓', 'Speed up / down'],
  ['Home / End', 'Jump to start / end'],
  ['Esc', 'Exit playback'],
  ['?', 'This help']
]

function HelpDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Playback shortcuts</DialogTitle>
        <DialogDescription>Keyboard controls for the transport.</DialogDescription>
        <dl className="mt-3 space-y-1.5">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between gap-4 text-body-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-label text-text">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
