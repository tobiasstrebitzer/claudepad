// The receive flow (PRD-11 §4.2). Paste a cp-blob-… (or upload a .cpblob),
// decrypt it with the current identity, show the sender's fingerprint (self-claimed
// name, trust only on a match), then hand the session to the viewer. A blob not
// addressed to us fails closed - no partial render (FR-11).

import { Loader2, TriangleAlert, Upload } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '../components/ui/Dialog'
import { Textarea } from '../components/ui/Textarea'
import { useIdentityContext } from '../identity'
import { useRegistry } from '../registry'
import { openShare, type OpenShareResult } from './blob'
import { CP_BLOB_PREFIX } from './detect'

/** A short link/id is anything that isn't already an inline `cp-blob-…`. */
function looksLikeId(text: string): boolean {
  return !text.trim().startsWith(CP_BLOB_PREFIX)
}

/** Pull the blob id out of a link (`?share=<id>` or `…/blobs/<id>`) or use the raw id. */
function blobIdFrom(text: string): string {
  const t = text.trim()
  try {
    const u = new URL(t)
    const fromQuery = u.searchParams.get('share')
    if (fromQuery) return fromQuery
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? t)
  } catch {
    return t
  }
}

export function ReceiveDialog({
  open,
  onOpenChange,
  onReceived,
  initialBlob
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceived: (result: OpenShareResult) => void
  /**
   * A `cp-blob-…` to seed the dialog with - set when a blob arrives via the
   * home drop/paste/file-picker surface. With an unlocked identity it decrypts
   * straight away; otherwise it's held in the field until unlock.
   */
  initialBlob?: string
}) {
  const { state: idState } = useIdentityContext()
  const registry = useRegistry()
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const unlocked = idState.status === 'unlocked'
  const registryClient = registry.client
  const [inboxIds, setInboxIds] = React.useState<string[]>([])

  // When a registry is connected and we're unlocked, list anything addressed to
  // us (opt-in inbox index). Best-effort: a registry without an inbox just yields
  // nothing.
  React.useEffect(() => {
    if (!open || !unlocked || !registryClient) {
      setInboxIds([])
      return
    }
    let live = true
    registryClient
      .inbox()
      .then((ids) => live && setInboxIds(ids))
      .catch(() => live && setInboxIds([]))
    return () => {
      live = false
    }
  }, [open, unlocked, registryClient])

  const decrypt = React.useCallback(
    async (text: string) => {
      if (idState.status !== 'unlocked') return
      setBusy(true)
      setError(null)
      try {
        // A short link / id (not an inline blob) is fetched from the connected
        // registry first; the registry only ever returns opaque ciphertext.
        let blobText = text.trim()
        if (registryClient && looksLikeId(blobText)) {
          const bytes = await registryClient.get(blobIdFrom(blobText))
          blobText = new TextDecoder().decode(bytes)
        }
        // Opening a session is never gated - decrypt and hand it straight to the
        // viewer (the sender's name rides along as the session label).
        onReceived(await openShare(idState.identity, blobText))
      } catch {
        // Fail closed: don't distinguish "not for you" from "corrupt" beyond this.
        setError(
          'This blob isn’t addressed to you, or it’s corrupt. Nothing was decrypted.'
        )
      } finally {
        setBusy(false)
      }
    },
    [idState, registryClient, onReceived]
  )

  // Reset on open; if a blob was handed in, seed the field and auto-decrypt it
  // (frictionless: a dropped/pasted share opens already-decrypting).
  React.useEffect(() => {
    if (!open) return
    setError(null)
    const seed = initialBlob?.trim() ?? ''
    setInput(seed)
    if (seed && unlocked) void decrypt(seed)
  }, [open, initialBlob, unlocked, decrypt])

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setInput(text)
    void decrypt(text)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {idState.status !== 'unlocked' ? (
          <>
            <DialogTitle>Unlock your identity first</DialogTitle>
            <DialogDescription>
              A blob is encrypted to your public key - you need your identity
              unlocked to decrypt it. Set it up from the sidebar.
            </DialogDescription>
          </>
        ) : (
          <>
            <DialogTitle>Open an encrypted share</DialogTitle>
            <DialogDescription>
              Paste a <code>cp-blob-…</code> someone sent you, or upload a{' '}
              <code>.cpad</code> file.
              {registryClient && (
                <>
                  {' '}
                  You can also paste a short link or id from{' '}
                  <span className="font-medium text-text">{registry.state.status === 'connected' ? registry.state.manifest.name : 'your registry'}</span>.
                </>
              )}
            </DialogDescription>

            {inboxIds.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-label uppercase tracking-[0.02em] text-muted-foreground">
                  Shared with me ({inboxIds.length})
                </p>
                <ul className="max-h-[24vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {inboxIds.map((id) => (
                    <li key={id} className="flex items-center gap-2 p-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-label text-muted-foreground">
                        {id}
                      </code>
                      <Button variant="secondary" size="sm" onClick={() => void decrypt(id)} disabled={busy}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="cp-blob-…"
              className="mt-3 min-h-[96px] font-mono text-body-sm"
              spellCheck={false}
              autoFocus
            />
            {error && (
              <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-danger">
                <TriangleAlert className="size-4 shrink-0" /> {error}
              </p>
            )}

            <DialogFooter>
              <label
                className="mr-auto inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-body-sm font-medium text-text transition-colors hover:bg-accent-tint"
              >
                <input
                  type="file"
                  accept=".cpad,text/plain"
                  className="sr-only"
                  onChange={onUpload}
                />
                <Upload className="size-4" /> Upload file
              </label>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void decrypt(input)} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Decrypt
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
