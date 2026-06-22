// The "Share…" top-bar action (PRD-11 entry point). Replaces the P2 placeholder.
// Always clickable when a session is loaded; if the identity isn't unlocked the
// dialog explains how to set it up (rather than disabling the affordance).

import type { Session } from '@claudepad/schema'
import { Share2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { ShareDialog } from './ShareDialog'

export function ShareButton({ session }: { session: Session }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label="Share">
        <Share2 />
        <span className="hidden @3xl/topbar:inline">Share…</span>
      </Button>
      {/* Mount only when open: the dialog reads identity context + scans the
          session, neither of which should run (or require a provider) until used. */}
      {open && <ShareDialog session={session} open={open} onOpenChange={setOpen} />}
    </>
  )
}
