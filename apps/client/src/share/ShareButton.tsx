// The "Share…" top-bar action (PRD-11 entry point). A split button: the main
// action opens the share dialog; the dropdown caret quick-shares with a recent
// recipient (pre-selected), so it's a two-click share (caret → name → Share).
// Always clickable when a session is loaded; if the identity isn't unlocked the
// dialog explains how to set it up.

import type { Session } from '@/schema'
import { ChevronDown, Share2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '../components/ui/DropdownMenu'
import { Fingerprint } from '../identity'
import { ShareDialog } from './ShareDialog'
import { useAddressBook, type Contact } from './useAddressBook'

export function ShareButton({ session }: { session: Session }) {
  const [open, setOpen] = React.useState(false)
  const [initialContact, setInitialContact] = React.useState<Contact | undefined>()
  const addressBook = useAddressBook()

  const openWith = (contact?: Contact) => {
    setInitialContact(contact)
    setOpen(true)
  }

  return (
    <>
      <span className="inline-flex items-stretch">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openWith(undefined)}
          aria-label="Share"
          className="rounded-r-none"
        >
          <Share2 />
          <span className="hidden @3xl/topbar:inline">Share…</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="secondary"
                aria-label="Quick share with a recent recipient"
                className="rounded-l-none border-l border-border/60 px-1.5"
              >
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>Quick share</DropdownMenuLabel>
            {addressBook.contacts.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No recent recipients</p>
            ) : (
              addressBook.contacts.map((c) => (
                <DropdownMenuItem key={c.pub} onClick={() => openWith(c)}>
                  <span className="min-w-0 flex-1 truncate">{c.alias || c.name}</span>
                  <Fingerprint pub={c.pub} size="sm" className="shrink-0" />
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      {/* Mount only when open: the dialog reads identity context + scans the
          session, neither of which should run (or require a provider) until used. */}
      {open && (
        <ShareDialog
          session={session}
          open={open}
          onOpenChange={setOpen}
          initialContact={initialContact}
        />
      )}
    </>
  )
}
