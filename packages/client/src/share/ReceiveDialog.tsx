// The receive flow (PRD-11 §4.2). Paste a cp-blob-… (or upload a .cpblob),
// decrypt it with the current identity, show the sender's fingerprint (self-claimed
// name, trust only on a match), then hand the session to the viewer. A blob not
// addressed to us fails closed - no partial render (FR-11).

import { Loader2, ShieldCheck, TriangleAlert, Upload } from 'lucide-react'
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
import { Fingerprint, useIdentityContext } from '../identity'
import { openShare, type OpenShareResult } from './blob'

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
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<OpenShareResult | null>(null)
  const unlocked = idState.status === 'unlocked'

  const decrypt = React.useCallback(
    async (text: string) => {
      if (idState.status !== 'unlocked') return
      setBusy(true)
      setError(null)
      try {
        setResult(await openShare(idState.identity, text))
      } catch {
        // Fail closed: don't distinguish "not for you" from "corrupt" beyond this.
        setError(
          'This blob isn’t addressed to you, or it’s corrupt. Nothing was decrypted.'
        )
      } finally {
        setBusy(false)
      }
    },
    [idState]
  )

  // Reset on open; if a blob was handed in, seed the field and auto-decrypt it
  // (frictionless: a dropped/pasted share opens already-decrypting).
  React.useEffect(() => {
    if (!open) return
    setError(null)
    setResult(null)
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
        ) : result ? (
          <Received result={result} onView={() => onReceived(result)} />
        ) : (
          <>
            <DialogTitle>Open an encrypted share</DialogTitle>
            <DialogDescription>
              Paste a <code>cp-blob-…</code> someone sent you, or upload a{' '}
              <code>.cpad</code> file.
            </DialogDescription>

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

function Received({
  result,
  onView
}: {
  result: OpenShareResult
  onView: () => void
}) {
  return (
    <>
      <DialogTitle>
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-success" /> Decrypted
        </span>
      </DialogTitle>
      <DialogDescription>
        Claims to be from <span className="font-medium text-text">{result.from.name}</span> -
        trust the content only if this fingerprint matches theirs.
      </DialogDescription>

      <div className="mt-3 rounded-md border border-border bg-bg p-3">
        <Fingerprint pub={result.from.pub} size="sm" />
        <p className="mt-2 text-label text-muted-foreground">
          Granted: {result.tier === 'body+secret' ? 'body + secrets' : 'body only'}
          {result.tier === 'body' && ' - secrets show as placeholders.'}
        </p>
      </div>

      <DialogFooter>
        <Button onClick={onView}>View session</Button>
      </DialogFooter>
    </>
  )
}
