// The share wizard (PRD-11 §4.1 + PRD-06 review). Four steps in one dialog:
//   1. Review   - mandatory secret review; redact/dismiss, add a literal, ACK limits
//   2. Recipient- paste cp-pub-…, confirm name + fingerprint out of band
//   3. Grant    - body-only vs body+secrets (secrets disabled when none redacted)
//   4. Result   - the cp-blob-…, auto-copied + downloadable, with honest trade-offs
//
// All crypto + redaction is local; nothing is uploaded (PRD-11 FR-17).

import type { Session } from '@claudepad/schema'
import {
  DEFAULT_SCAN_SETTINGS,
  DETECTION_QUALITY,
  findLeakedValues,
  redact,
  type Detection,
  type DetectionState,
  type ScanSettings
} from '@claudepad/secrets'
import { decodePublicCard, type Tier } from '@claudepad/shared'
import {
  Check,
  Copy,
  Download,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  TriangleAlert,
  X
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
import { createShare, createMultiShare } from './blob'
import { useAddressBook, type AddressBook, type Contact } from './useAddressBook'
import { useSecretScan } from './useSecretScan'

type Step = 'review' | 'recipient' | 'grant' | 'result'

/** A confirmed recipient for this share (public card + decoded display fields). */
interface Recipient {
  card: string
  name: string
  pub: string
}

const PUB_PREFIX = 'cp-pub-'

// Entropy-sensitivity presets for the review UI (PRD-06 FR-15). Higher = more
// aggressive flagging (more recall, more false positives). Balanced = default.
const SENSITIVITY_PRESETS = [
  { label: 'Strict', value: 0.2 },
  { label: 'Balanced', value: 0.5 },
  { label: 'Aggressive', value: 0.8 }
] as const

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
  const [ack, setAck] = React.useState(false)
  const [literal, setLiteral] = React.useState('')
  const [sensitivity, setSensitivity] = React.useState(DEFAULT_SCAN_SETTINGS.entropySensitivity)
  const [hideDismissed, setHideDismissed] = React.useState(false)

  // Scan off the main thread (PRD-06 FR-10) - keeps the dialog responsive on
  // large sessions and reports progress; closing the dialog cancels it. Changing
  // sensitivity re-scans (the worker re-runs with the new settings).
  const scanSettings = React.useMemo<ScanSettings>(
    () => ({ ...DEFAULT_SCAN_SETTINGS, entropySensitivity: sensitivity }),
    [sensitivity]
  )
  const scan = useSecretScan(session, open, scanSettings)
  const addressBook = useAddressBook()

  const [recipientInput, setRecipientInput] = React.useState('')
  const [recipientConfirmed, setRecipientConfirmed] = React.useState(false)
  // Confirmed recipients for this share. One -> a single-recipient blob (leaks
  // nothing); more than one -> a single multi-recipient blob (PRD-11 Q-14).
  const [recipients, setRecipients] = React.useState<Recipient[]>([])

  const [tier, setTier] = React.useState<Tier>('body')
  const [blob, setBlob] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset the wizard whenever it opens so re-share starts clean. The scan itself
  // is owned by useSecretScan; we seed the editable detection list from it.
  React.useEffect(() => {
    if (!open) return
    setStep('review')
    setAck(false)
    setDetections([])
    setSensitivity(DEFAULT_SCAN_SETTINGS.entropySensitivity)
    setHideDismissed(false)
    setRecipientInput('')
    setRecipientConfirmed(false)
    setRecipients([])
    setTier('body')
    setBlob('')
    setError(null)
  }, [open, session])

  // Seed the editable list once the (worker) scan completes. A re-scan (e.g. a
  // sensitivity change) replaces the scanner's findings but preserves values the
  // user added by hand (MANUAL), which aren't part of any scan.
  React.useEffect(() => {
    if (scan.scanning) return
    setDetections((prev) => [...prev.filter((d) => d.type === 'MANUAL'), ...scan.detections])
  }, [scan.scanning, scan.detections])

  const redactedCount = detections.filter((d) => d.state === 'redact').length
  const dismissedCount = detections.length - redactedCount

  // The list the user is looking at (optionally hiding dismissed/suppressed noise).
  const visible = React.useMemo(
    () => (hideDismissed ? detections.filter((d) => d.state !== 'dismissed') : detections),
    [detections, hideDismissed]
  )

  // Bulk-apply a state to everything currently shown.
  const setAllVisible = (state: DetectionState) => {
    const ids = new Set(visible.map((d) => d.id))
    setDetections((prev) => prev.map((d) => (ids.has(d.id) ? { ...d, state } : d)))
  }

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

  const alreadyAdded = recipient != null && recipients.some((r) => r.pub === recipient.pub)

  // Add the confirmed in-progress recipient to the list, then clear the input.
  const addRecipient = () => {
    if (!recipient || !recipientConfirmed || alreadyAdded) return
    setRecipients((prev) => [
      ...prev,
      { card: recipientInput.trim(), name: recipient.name, pub: recipient.pub }
    ])
    setRecipientInput('')
    setRecipientConfirmed(false)
  }

  const removeRecipient = (pub: string) =>
    setRecipients((prev) => prev.filter((r) => r.pub !== pub))

  const recipientLabel =
    recipients.length === 1 ? recipients[0]!.name : `${recipients.length} recipients`

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
    if (idState.status !== 'unlocked' || recipients.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const { body, secretMap } = redact(session, detections)
      // Defensive hard gate (PRD-06 FR-25): never ship a body that still contains
      // a confirmed secret value.
      const leaked = findLeakedValues(body, secretMap)
      if (leaked.length > 0) throw new Error('Redaction failed an integrity check - not sharing.')
      // One recipient -> a single-recipient blob (leaks nothing); several -> one
      // multi-recipient blob (exposes the recipient count, by design).
      const cpblob =
        recipients.length === 1
          ? await createShare({
            sender: idState.identity,
            recipientCard: recipients[0]!.card,
            body,
            secretMap,
            tier
          })
          : await createMultiShare({
            sender: idState.identity,
            recipientCards: recipients.map((r) => r.card),
            body,
            secretMap,
            tier
          })
      // Remember each recipient (public card only) for next time.
      for (const r of recipients) addressBook.remember({ card: r.card, name: r.name, pub: r.pub })
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
            scanning={scan.scanning}
            progress={scan.progress}
            scanError={scan.error}
            detections={visible}
            totalCount={detections.length}
            redactedCount={redactedCount}
            dismissedCount={dismissedCount}
            sensitivity={sensitivity}
            setSensitivity={setSensitivity}
            hideDismissed={hideDismissed}
            setHideDismissed={setHideDismissed}
            setAllVisible={setAllVisible}
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
            recipients={recipients}
            alreadyAdded={alreadyAdded}
            addRecipient={addRecipient}
            removeRecipient={removeRecipient}
            addressBook={addressBook}
            onBack={() => setStep('review')}
            onNext={() => setStep('grant')}
          />
        ) : step === 'grant' ? (
          <GrantStep
            recipientName={recipientLabel}
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
            recipientName={recipientLabel}
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
  progress,
  scanError,
  detections,
  totalCount,
  redactedCount,
  dismissedCount,
  sensitivity,
  setSensitivity,
  hideDismissed,
  setHideDismissed,
  setAllVisible,
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
  progress: number | null
  scanError: string | null
  detections: Detection[]
  totalCount: number
  redactedCount: number
  dismissedCount: number
  sensitivity: number
  setSensitivity: (v: number) => void
  hideDismissed: boolean
  setHideDismissed: (v: boolean) => void
  setAllVisible: (state: DetectionState) => void
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

      <details className="mt-1.5 text-label text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-text">
          How good is detection?
        </summary>
        <p className="mt-1 pl-0.5">
          On our labeled test corpus, detection catches at least{' '}
          {Math.round(DETECTION_QUALITY.recall * 100)}% of known secret shapes
          (API keys, tokens, private keys, .env values), at ~
          {Math.round(DETECTION_QUALITY.precision * 100)}% precision - so some
          flagged items are harmless. It can still miss novel or unusual secrets,
          which is why this review (and the add box below) exist. Nothing is
          uploaded; scanning runs entirely in your browser.
        </p>
      </details>

      {!scanning && !scanError && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            Sensitivity
            <span className="inline-flex overflow-hidden rounded-md border border-border">
              {SENSITIVITY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSensitivity(p.value)}
                  aria-pressed={sensitivity === p.value}
                  className={cn(
                    'px-2 py-0.5 text-label transition-colors',
                    sensitivity === p.value
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent-tint'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </span>
          {totalCount > 0 && (
            <span className="inline-flex items-center gap-2">
              <button type="button" onClick={() => setAllVisible('redact')} className="hover:text-text">
                Redact all
              </button>
              <span aria-hidden>·</span>
              <button type="button" onClick={() => setAllVisible('dismissed')} className="hover:text-text">
                Dismiss all
              </button>
            </span>
          )}
          {dismissedCount > 0 && (
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={hideDismissed}
                onCheckedChange={(v) => setHideDismissed(v === true)}
              />
              Hide dismissed ({dismissedCount})
            </label>
          )}
        </div>
      )}

      <div className="mt-2 max-h-[40vh] overflow-y-auto rounded-md border border-border">
        {scanError ? (
          <p className="flex items-center gap-2 p-3 text-body-sm text-danger">
            <TriangleAlert className="size-4 shrink-0" /> {scanError}
          </p>
        ) : scanning ? (
          <div className="p-3">
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Scanning for secrets
              {progress != null && ` · ${Math.round(progress * 100)}%`}
            </p>
            {progress != null && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : detections.length === 0 ? (
          <p className="p-3 text-body-sm text-muted-foreground">
            {hideDismissed && totalCount > 0
              ? 'Dismissed items are hidden. Uncheck "Hide dismissed" to see them.'
              : 'No secrets detected. Add any the scanner missed below.'}
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
  recipients,
  alreadyAdded,
  addRecipient,
  removeRecipient,
  addressBook,
  onBack,
  onNext
}: {
  recipientInput: string
  setRecipientInput: (v: string) => void
  recipient: { name: string; pub: string } | null
  confirmed: boolean
  setConfirmed: (v: boolean) => void
  recipients: Recipient[]
  alreadyAdded: boolean
  addRecipient: () => void
  removeRecipient: (pub: string) => void
  addressBook: AddressBook
  onBack: () => void
  onNext: () => void
}) {
  const invalid = recipientInput.trim().length > 0 && !recipient
  const addedPubs = new Set(recipients.map((r) => r.pub))
  const contacts = addressBook.contacts.filter((c) => !addedPubs.has(c.pub))
  const showContacts = recipientInput.trim().length === 0 && contacts.length > 0
  return (
    <>
      <DialogTitle>Share with…</DialogTitle>
      <DialogDescription>
        Paste each recipient’s public key (<code>cp-pub-…</code>). Only the people
        you add can decrypt the result. Add more than one to send a single shared
        blob (which reveals how many recipients there are, but not who).
      </DialogDescription>

      {recipients.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {recipients.map((r) => (
            <li
              key={r.pub}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg py-1 pl-2.5 pr-1 text-body-sm"
            >
              <span className="font-medium text-text">{r.name}</span>
              <Fingerprint pub={r.pub} size="sm" />
              <button
                type="button"
                onClick={() => removeRecipient(r.pub)}
                aria-label={`Remove ${r.name}`}
                className="rounded-full p-0.5 text-muted-foreground hover:text-danger"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showContacts && (
        <div className="mt-3">
          <p className="mb-1.5 text-label uppercase tracking-[0.02em] text-muted-foreground">
            Recent recipients
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {contacts.map((c) => (
              <ContactRow
                key={c.pub}
                contact={c}
                onPick={() => setRecipientInput(c.card)}
                onRemove={() => addressBook.remove(c.pub)}
                onAlias={(alias) => addressBook.setAlias(c.pub, alias)}
              />
            ))}
          </ul>
        </div>
      )}

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
      {recipient && alreadyAdded && (
        <p className="mt-1.5 text-body-sm text-muted-foreground">
          {recipient.name} is already on the list.
        </p>
      )}

      {recipient && !alreadyAdded && (
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
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={addRecipient}
            disabled={!confirmed}
          >
            <Plus /> Add recipient
          </Button>
        </div>
      )}

      <DialogFooter>
        <span className="mr-auto text-label text-muted-foreground">
          {recipients.length} added
        </span>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={recipients.length === 0}>
          Continue
        </Button>
      </DialogFooter>
    </>
  )
}

function ContactRow({
  contact,
  onPick,
  onRemove,
  onAlias
}: {
  contact: Contact
  onPick: () => void
  onRemove: () => void
  onAlias: (alias: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(contact.alias ?? '')
  const label = contact.alias || contact.name

  const commit = () => {
    onAlias(draft)
    setEditing(false)
  }

  return (
    <li className="flex items-center gap-2 p-2">
      {editing ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={contact.name}
          autoFocus
          className="h-7 flex-1 text-body-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent"
        >
          <span className="truncate text-body-sm font-medium text-text">{label}</span>
          <Fingerprint pub={contact.pub} size="sm" className="shrink-0" />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(contact.alias ?? '')
          setEditing((v) => !v)
        }}
        aria-label={`Rename ${label}`}
        className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-text"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Forget ${label}`}
        className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-danger"
      >
        <X className="size-3.5" />
      </button>
    </li>
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
    const slug = recipientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    a.download = `claudepad-share-${slug || 'recipient'}.cpad`
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

      <div className="mt-3 flex items-start gap-2">
        <code className="block min-w-0 flex-1 max-h-[40vh] overflow-y-auto rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-body-sm text-text whitespace-pre-wrap break-all">
          {blob}
        </code>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="secondary" size="icon" aria-label="Copy blob" onClick={() => copy(blob)}>
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button variant="secondary" size="icon" aria-label="Download .cpad" onClick={download}>
            <Download />
          </Button>
        </div>
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
