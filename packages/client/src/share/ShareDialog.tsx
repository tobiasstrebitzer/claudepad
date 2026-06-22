// The share wizard (PRD-11 §4.1 + PRD-06 review). Four steps in one dialog:
//   1. Review   - mandatory secret review; redact/dismiss, add a literal, ACK limits
//   2. Recipient- paste cp-pub-…, confirm name + fingerprint out of band
//   3. Grant    - body-only vs body+secrets (secrets disabled when none redacted)
//   4. Result   - the cp-blob-…, auto-copied + downloadable, with honest trade-offs
//
// All crypto + redaction is local; nothing is uploaded (PRD-11 FR-17).

import type { Session } from '@claudepad/schema'
import {
  findLeakedValues,
  redact,
  scanSession,
  type Detection
} from '@claudepad/secrets'
import { decodePublicCard, type Tier } from '@claudepad/shared'
import {
  Check,
  Copy,
  Download,
  Loader2,
  Plus,
  ShieldAlert,
  TriangleAlert
} from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { Fingerprint, useIdentityContext } from '../identity'
import { useCopy } from '../ingest/useCopy'
import { cn } from '../lib/cn'
import { createShare } from './blob'

type Step = 'review' | 'recipient' | 'grant' | 'result'

const PUB_PREFIX = 'cp-pub-'

export function ShareDialog({
  session,
  open,
  onOpenChange
}: {
  session: Session
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state: idState } = useIdentityContext()
  const [step, setStep] = React.useState<Step>('review')
  const [detections, setDetections] = React.useState<Detection[]>([])
  const [scanning, setScanning] = React.useState(true)
  const [ack, setAck] = React.useState(false)
  const [literal, setLiteral] = React.useState('')

  const [recipientInput, setRecipientInput] = React.useState('')
  const [recipientConfirmed, setRecipientConfirmed] = React.useState(false)

  const [tier, setTier] = React.useState<Tier>('body')
  const [blob, setBlob] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Scan once when the dialog opens (main thread; a worker is a documented
  // follow-up). Reset everything on close so re-share starts clean.
  React.useEffect(() => {
    if (!open) return
    setScanning(true)
    setStep('review')
    setAck(false)
    setRecipientInput('')
    setRecipientConfirmed(false)
    setTier('body')
    setBlob('')
    setError(null)
    // Defer so the dialog paints before a large scan.
    const handle = setTimeout(() => {
      setDetections(scanSession(session))
      setScanning(false)
    }, 0)
    return () => clearTimeout(handle)
  }, [open, session])

  const redactedCount = detections.filter((d) => d.state === 'redact').length

  const recipient = React.useMemo(() => {
    const raw = recipientInput.trim()
    if (!raw) return null
    const body = raw.startsWith(PUB_PREFIX) ? raw.slice(PUB_PREFIX.length) : raw
    try {
      return decodePublicCard(body)
    } catch {
      return null
    }
  }, [recipientInput])

  const toggle = (id: string) =>
    setDetections((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, state: d.state === 'redact' ? 'dismissed' : 'redact' } : d
      )
    )

  const addLiteral = () => {
    const value = literal.trim()
    if (!value) return
    setDetections((prev) => {
      if (prev.some((d) => d.value === value)) return prev
      const det: Detection = {
        id: 'm' + Math.abs(hashString(value)).toString(36),
        type: 'MANUAL',
        value,
        length: value.length,
        occurrences: 1,
        snippet: value.slice(0, 4) + '••••',
        signals: ['env-exact'],
        confidence: 1,
        state: 'redact'
      }
      return [det, ...prev]
    })
    setLiteral('')
  }

  const encrypt = async () => {
    if (idState.status !== 'unlocked' || !recipient) return
    setBusy(true)
    setError(null)
    try {
      const { body, secretMap } = redact(session, detections)
      // Defensive hard gate (PRD-06 FR-25): never ship a body that still contains
      // a confirmed secret value.
      const leaked = findLeakedValues(body, secretMap)
      if (leaked.length > 0) throw new Error('Redaction failed an integrity check - not sharing.')
      const cpblob = await createShare({
        sender: idState.identity,
        recipientCard: recipientInput,
        body,
        secretMap,
        tier
      })
      setBlob(cpblob)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not encrypt this session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {idState.status !== 'unlocked' ? (
          <NeedsIdentity />
        ) : step === 'review' ? (
          <ReviewStep
            scanning={scanning}
            detections={detections}
            redactedCount={redactedCount}
            ack={ack}
            setAck={setAck}
            literal={literal}
            setLiteral={setLiteral}
            addLiteral={addLiteral}
            toggle={toggle}
            onCancel={() => onOpenChange(false)}
            onNext={() => setStep('recipient')}
          />
        ) : step === 'recipient' ? (
          <RecipientStep
            recipientInput={recipientInput}
            setRecipientInput={setRecipientInput}
            recipient={recipient}
            confirmed={recipientConfirmed}
            setConfirmed={setRecipientConfirmed}
            onBack={() => setStep('review')}
            onNext={() => setStep('grant')}
          />
        ) : step === 'grant' ? (
          <GrantStep
            recipientName={recipient?.name ?? 'recipient'}
            redactedCount={redactedCount}
            tier={tier}
            setTier={setTier}
            busy={busy}
            error={error}
            onBack={() => setStep('recipient')}
            onEncrypt={encrypt}
          />
        ) : (
          <ResultStep
            blob={blob}
            recipientName={recipient?.name ?? 'recipient'}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function NeedsIdentity() {
  return (
    <>
      <DialogTitle>Set up your identity first</DialogTitle>
      <DialogDescription>
        Sharing encrypts a session to a recipient and signs it from you. Create or
        unlock your identity from the sidebar, then try again.
      </DialogDescription>
    </>
  )
}

function ReviewStep({
  scanning,
  detections,
  redactedCount,
  ack,
  setAck,
  literal,
  setLiteral,
  addLiteral,
  toggle,
  onCancel,
  onNext
}: {
  scanning: boolean
  detections: Detection[]
  redactedCount: number
  ack: boolean
  setAck: (v: boolean) => void
  literal: string
  setLiteral: (v: string) => void
  addLiteral: () => void
  toggle: (id: string) => void
  onCancel: () => void
  onNext: () => void
}) {
  return (
    <>
      <DialogTitle>Review before sharing</DialogTitle>
      <div className="mt-2 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-body-sm text-text">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <span>
          Detection is best-effort. Anything left un-redacted is visible to{' '}
          <strong>everyone</strong> you share with. Review every item and add
          anything we missed.
        </span>
      </div>

      <div className="mt-3 max-h-[40vh] overflow-y-auto rounded-md border border-border">
        {scanning ? (
          <p className="flex items-center gap-2 p-3 text-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Scanning for secrets…
          </p>
        ) : detections.length === 0 ? (
          <p className="p-3 text-body-sm text-muted-foreground">
            No secrets detected. Add any the scanner missed below.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {detections.map((d) => (
              <li key={d.id} className="flex items-start gap-2.5 p-2.5">
                <Checkbox
                  checked={d.state === 'redact'}
                  onCheckedChange={() => toggle(d.id)}
                  aria-label={`Redact ${d.type}`}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <code className="text-body-sm font-medium text-text">{d.type}</code>
                    <span className="text-label text-muted-foreground">({d.length})</span>
                    {d.suppressedReason && (
                      <span className="text-label text-muted-foreground">· {d.suppressedReason}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-label text-muted-foreground">
                    {d.snippet} · {d.signals.join(', ')}
                    {d.occurrences > 1 && ` · ×${d.occurrences}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          value={literal}
          onChange={(e) => setLiteral(e.target.value)}
          placeholder="Add a value the scanner missed…"
          className="font-mono text-body-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLiteral()
            }
          }}
        />
        <Button variant="secondary" onClick={addLiteral} disabled={!literal.trim()}>
          <Plus /> Add
        </Button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-body-sm text-text">
        <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
        <span>
          I’ve reviewed these detections and understand detection is best-effort -
          missed secrets stay readable to every recipient.
        </span>
      </label>

      <DialogFooter>
        <span className="mr-auto text-label text-muted-foreground">{redactedCount} will be redacted</span>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onNext} disabled={!ack || scanning}>
          Continue
        </Button>
      </DialogFooter>
    </>
  )
}

function RecipientStep({
  recipientInput,
  setRecipientInput,
  recipient,
  confirmed,
  setConfirmed,
  onBack,
  onNext
}: {
  recipientInput: string
  setRecipientInput: (v: string) => void
  recipient: { name: string; pub: string } | null
  confirmed: boolean
  setConfirmed: (v: boolean) => void
  onBack: () => void
  onNext: () => void
}) {
  const invalid = recipientInput.trim().length > 0 && !recipient
  return (
    <>
      <DialogTitle>Share with…</DialogTitle>
      <DialogDescription>
        Paste the recipient’s public key (<code>cp-pub-…</code>). Only they will be
        able to decrypt the result.
      </DialogDescription>

      <Input
        value={recipientInput}
        onChange={(e) => setRecipientInput(e.target.value)}
        placeholder="cp-pub-…"
        className="mt-3 font-mono text-body-sm"
        spellCheck={false}
        autoFocus
      />
      {invalid && (
        <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-danger">
          <TriangleAlert className="size-4" /> That doesn’t look like a valid public key.
        </p>
      )}

      {recipient && (
        <div className="mt-3 rounded-md border border-border bg-bg p-3">
          <p className="text-body-sm">
            For <span className="font-medium">{recipient.name}</span>
          </p>
          <Fingerprint pub={recipient.pub} className="mt-1" size="sm" />
          <label className="mt-2 flex items-start gap-2 text-body-sm text-text">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>
              This fingerprint matches what {recipient.name} told me out of band.
            </span>
          </label>
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!recipient || !confirmed}>
          Continue
        </Button>
      </DialogFooter>
    </>
  )
}

function GrantStep({
  recipientName,
  redactedCount,
  tier,
  setTier,
  busy,
  error,
  onBack,
  onEncrypt
}: {
  recipientName: string
  redactedCount: number
  tier: Tier
  setTier: (t: Tier) => void
  busy: boolean
  error: string | null
  onBack: () => void
  onEncrypt: () => void
}) {
  const hasSecrets = redactedCount > 0
  return (
    <>
      <DialogTitle>Grant</DialogTitle>
      <DialogDescription>
        Choose what {recipientName} can read. This is enforced by cryptography, not
        by the UI.
      </DialogDescription>

      <div className="mt-3 space-y-2">
        <TierOption
          label="Body only"
          desc="The transcript with secrets shown as placeholders."
          selected={tier === 'body'}
          onSelect={() => setTier('body')}
        />
        <TierOption
          label={`Body + secrets${hasSecrets ? ` (${redactedCount})` : ''}`}
          desc={
            hasSecrets
              ? 'The transcript plus the real secret values.'
              : 'No secrets were redacted, so there’s nothing extra to grant.'
          }
          selected={tier === 'body+secret'}
          disabled={!hasSecrets}
          onSelect={() => hasSecrets && setTier('body+secret')}
        />
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-body-sm text-danger">
          <TriangleAlert className="size-4" /> {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={onEncrypt} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Encrypt for {recipientName}
        </Button>
      </DialogFooter>
    </>
  )
}

function TierOption({
  label,
  desc,
  selected,
  disabled,
  onSelect
}: {
  label: string
  desc: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
        selected ? 'border-accent bg-accent-tint' : 'border-border hover:bg-accent-tint',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
          selected ? 'border-accent' : 'border-muted'
        )}
      >
        {selected && <span className="size-2 rounded-full bg-accent" />}
      </span>
      <span>
        <span className="block text-body-sm font-medium text-text">{label}</span>
        <span className="block text-label text-muted-foreground">{desc}</span>
      </span>
    </button>
  )
}

function ResultStep({
  blob,
  recipientName,
  onDone
}: {
  blob: string
  recipientName: string
  onDone: () => void
}) {
  const [copied, copy] = useCopy()
  // Auto-copy on success (PRD-11 FR-6).
  React.useEffect(() => {
    if (blob) copy(blob)
  }, [blob, copy])

  const download = () => {
    const url = URL.createObjectURL(new Blob([blob], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `claudepad-share-${recipientName}.cpad`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <DialogTitle>
        <span className="flex items-center gap-2">
          <Check className="size-5 text-success" /> Encrypted for {recipientName}
        </span>
      </DialogTitle>
      <DialogDescription>
        Drop it anywhere - Slack, email, a file. Only {recipientName} can read it.
      </DialogDescription>

      <div className="mt-3 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-body-sm text-text">
          {blob}
        </code>
        <Button variant="secondary" size="icon" aria-label="Copy blob" onClick={() => copy(blob)}>
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
        <Button variant="secondary" size="icon" aria-label="Download .cpad" onClick={download}>
          <Download />
        </Button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg p-2.5 text-label text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <span>
          No server holds this. If it’s lost, it’s gone - it can’t be expired,
          revoked, or recovered.
        </span>
      </div>

      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  )
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
