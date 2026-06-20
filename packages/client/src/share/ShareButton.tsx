// The "Share…" top-bar action (PRD-11 entry point). Replaces the P2 placeholder.
// Always clickable when a session is loaded; if the identity isn't unlocked the
// dialog explains how to set it up (rather than disabling the affordance).

import * as React from 'react';
import { Share2 } from 'lucide-react';
import type { Session } from '@claudepad/schema';
import { Button } from '../components/ui/button';
import { ShareDialog } from './ShareDialog';

export function ShareButton({ session }: { session: Session }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Share2 />
        Share…
      </Button>
      {/* Mount only when open: the dialog reads identity context + scans the
          session, neither of which should run (or require a provider) until used. */}
      {open && <ShareDialog session={session} open={open} onOpenChange={setOpen} />}
    </>
  );
}
