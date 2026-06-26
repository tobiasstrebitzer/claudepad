// @/usage/scorecard - ScorecardDialog.tsx
//
// The share surface: renders the scorecard to a fixed 1200x630 canvas (2x for
// crisp retina output), then Download / Copy as PNG. Anonymous by default - an
// opt-in toggle stamps your emoji fingerprint + name when an identity is
// unlocked. Colors and fonts are pulled from the live design tokens so the card
// matches the user's theme; rendering stays a pure call into draw.ts.

import * as React from 'react'
import { Download, ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/Dialog'
import { useFingerprint } from '../../identity/Fingerprint'
import { useIdentityContext } from '../../identity'
import type { DashboardView } from '../derive'
import { CARD_H, CARD_W, drawScorecard, type CardIdentity, type CardPalette } from './draw'
import { buildScorecard } from './stats'

// Fixed export scale - deterministic PNG resolution regardless of the device.
const SCALE = 2

function readVar(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim()
}

function fontOf(family: 'serif' | 'sans' | 'mono'): string {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  if (family !== 'sans') probe.style.fontFamily = `var(--font-${family})`
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).fontFamily
  probe.remove()
  return resolved || family
}

/** Resolve a card palette from the live tokens (no raw hex in source). */
function resolvePalette(): CardPalette {
  const s = getComputedStyle(document.documentElement)
  return {
    bg: readVar(s, '--bg'),
    surface: readVar(s, '--surface'),
    text: readVar(s, '--text'),
    muted: readVar(s, '--text-muted'),
    accent: readVar(s, '--accent'),
    accentTint: readVar(s, '--accent-tint'),
    border: readVar(s, '--border'),
    serif: fontOf('serif'),
    sans: fontOf('sans'),
    mono: fontOf('mono')
  }
}

interface ScorecardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: DashboardView
  rangeLabel?: string
}

export function ScorecardDialog({ open, onOpenChange, view, rangeLabel }: ScorecardDialogProps): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [showIdentity, setShowIdentity] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const identityState = useIdentityContext().state
  const unlocked = identityState.status === 'unlocked' ? identityState : undefined
  const fp = useFingerprint(unlocked?.identity.pub)

  const card = React.useMemo(() => buildScorecard(view), [view])
  const identity: CardIdentity | undefined =
    showIdentity && unlocked && fp ? { name: unlocked.identity.name, emoji: fp.emoji } : undefined

  // Render whenever the dialog is open or the inputs change. Wait for fonts so
  // the serif/sans stacks paint instead of a fallback.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const render = () => {
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = CARD_W * SCALE
      canvas.height = CARD_H * SCALE
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      drawScorecard(ctx, card, resolvePalette(), {
        ...(identity ? { identity } : {}),
        ...(rangeLabel ? { rangeLabel } : {})
      })
    }
    void document.fonts.ready.then(() => !cancelled && render())
    render() // immediate pass; the fonts.ready pass repaints once they load
    return () => {
      cancelled = true
    }
  }, [open, card, identity, rangeLabel])

  const toBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) {
        resolve(null)
        return
      }
      // toBlob returns void, so the result must come from its callback - not a
      // `?? resolve(null)` fallback (that would resolve null before the callback).
      canvas.toBlob(resolve, 'image/png')
    })

  const download = async (): Promise<void> => {
    const blob = await toBlob()
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'claudepad-scorecard.png'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copy = async (): Promise<void> => {
    const blob = await toBlob()
    if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      await download()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your claudepad scorecard</DialogTitle>
          <DialogDescription>
            A shareable summary of your usage - tokens, cost, and the efficiency metrics that matter.
            Rendered locally; nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-border shadow-sm"
          style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
          aria-label="Scorecard preview"
        />

        {unlocked ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showIdentity}
              onChange={(e) => setShowIdentity(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Stamp my identity ({unlocked.identity.name}) and emoji fingerprint on the card
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Anonymous - no project names or identity. Create an identity to optionally sign the card.
          </p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <Loader2 className="animate-spin" /> : <ImageIcon />}
            {copied ? 'Copied!' : 'Copy image'}
          </Button>
          <Button onClick={() => void download()}>
            <Download />
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
