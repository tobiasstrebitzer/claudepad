// First-launch onboarding (re-runnable from the sidebar). A few quick how-to
// steps, then an inline, simplified identity generator (name only) so a new user
// leaves the wizard ready to share. All local; nothing is uploaded.

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  KeyRound,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { encodePublicCard } from '@claudepad/crypto'
import { RegistryClient } from '@claudepad/registry-client'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { useIdentityContext } from '../identity'
import { cn } from '../lib/cn'
import { DEFAULT_REGISTRY_LABEL, DEFAULT_REGISTRY_URL, pubHash, useRegistry } from '../registry'

const PUB_PREFIX = 'cp-pub-'
// TODO: replace with the real explainer page when content lands.
const LEARN_MORE_URL = 'https://claudepad.io/registry'

// The how-to steps shown before the identity generator. The identity step is
// rendered separately (it owns minting).
const HOW_TO = [
  {
    icon: Sparkles,
    title: 'Welcome to claudepad',
    body: 'claudepad turns a raw Claude Code session into a clean, readable artifact you can explore, play back, and share - privately. Everything runs in your browser; nothing is uploaded.'
  },
  {
    icon: FolderOpen,
    title: 'Bring a session',
    body: 'On Chrome, connect your ~/.claude folder once and every project/session shows up in the sidebar. Anywhere else, drop a .jsonl file onto the page or paste it in. You can also open a sample to look around.'
  },
  {
    icon: Play,
    title: 'Read it, play it back',
    body: 'Sessions render as a prettified transcript - messages, tools, thinking, code. Hit play to watch it unfold in real time or presentation pace, with a scrubber and speed control.'
  },
  {
    icon: ShieldCheck,
    title: 'Share privately',
    body: 'To share, claudepad encrypts the session to a specific recipient’s public key - producing an inert blob you can drop anywhere. Only that person can read it. No server, no link that phones home.'
  }
] as const

export function OnboardingWizard({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // step 0..HOW_TO.length-1 are how-to; the final index is the identity step.
  const identityStep = HOW_TO.length
  const [step, setStep] = React.useState(0)

  // Restart at the top each time the wizard opens.
  React.useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const totalSteps = HOW_TO.length + 1
  const onHowTo = step < identityStep
  const next = () => setStep((s) => Math.min(s + 1, identityStep))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {onHowTo ? (
          <HowToStep
            entry={HOW_TO[step]!}
            step={step}
            totalSteps={totalSteps}
            onSkip={() => onOpenChange(false)}
            onBack={step > 0 ? back : undefined}
            onNext={next}
          />
        ) : (
          <IdentityStep
            step={step}
            totalSteps={totalSteps}
            onBack={back}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Dots({ total, active }: { total: number; active: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full transition-colors',
            i === active ? 'bg-accent' : 'bg-border'
          )}
        />
      ))}
    </span>
  )
}

function HowToStep({
  entry,
  step,
  totalSteps,
  onSkip,
  onBack,
  onNext
}: {
  entry: (typeof HOW_TO)[number]
  step: number
  totalSteps: number
  onSkip: () => void
  onBack?: () => void
  onNext: () => void
}) {
  const Icon = entry.icon
  return (
    <>
      <span className="grid size-11 place-items-center rounded-full bg-accent-tint text-accent">
        <Icon className="size-5" />
      </span>
      <DialogTitle className="text-display text-lg">{entry.title}</DialogTitle>
      <DialogDescription className="text-body-sm leading-relaxed">{entry.body}</DialogDescription>

      <DialogFooter className="mt-1 items-center sm:justify-between">
        <Dots total={totalSteps} active={step} />
        <span className="flex items-center gap-2">
          {onBack ? (
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          )}
          <Button onClick={onNext}>
            Next <ArrowRight />
          </Button>
        </span>
      </DialogFooter>
    </>
  )
}

function IdentityStep({
  step,
  totalSteps,
  onBack,
  onDone
}: {
  step: number
  totalSteps: number
  onBack: () => void
  onDone: () => void
}) {
  const identity = useIdentityContext()
  const registry = useRegistry()
  const [name, setName] = React.useState('')
  const [register, setRegister] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // The minted key's auth token, read lazily by the registry client when publishing.
  const authToken = React.useRef<string | null>(null)

  // Already has an identity (unlocked or locked) - nothing to mint.
  const existing =
    identity.state.status === 'unlocked'
      ? identity.state.identity.name
      : identity.state.status === 'locked'
        ? identity.state.name
        : null

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      if (register) {
        // Connect first so we can check the name is free and publish. If the
        // registry is unreachable, fall back to a local-only identity.
        let client: RegistryClient | null = null
        try {
          client = await RegistryClient.connect(DEFAULT_REGISTRY_URL, {
            getAuthToken: async () => authToken.current
          })
        } catch {
          client = null
        }
        if (client) {
          const taken = await client.resolve(trimmed).catch(() => null)
          if (taken) {
            setError(`"${trimmed}" is taken on ${DEFAULT_REGISTRY_LABEL}. Try another name.`)
            setBusy(false)
            return
          }
          const id = await identity.mint(trimmed)
          authToken.current = await pubHash(id.pub)
          // Publish is best-effort: the identity already exists locally either way.
          await client
            .publishIdentity(PUB_PREFIX + encodePublicCard(id), { handle: trimmed })
            .catch(() => {})
          registry.configure(DEFAULT_REGISTRY_URL)
        } else {
          await identity.mint(trimmed)
        }
      } else {
        await identity.mint(trimmed)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your identity.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span className="grid size-11 place-items-center rounded-full bg-accent-tint text-accent">
        {existing ? <Check className="size-5" /> : <KeyRound className="size-5" />}
      </span>

      {existing ? (
        <>
          <DialogTitle className="text-display text-lg">You’re all set</DialogTitle>
          <DialogDescription className="text-body-sm leading-relaxed">
            You already have an identity, <span className="font-medium text-text">{existing}</span>.
            You can share and receive encrypted sessions right away - manage it any time from the
            sidebar.
          </DialogDescription>
        </>
      ) : (
        <>
          <DialogTitle className="text-display text-lg">Create your identity</DialogTitle>
          <DialogDescription className="text-body-sm leading-relaxed">
            Your identity is a keypair minted right here in your browser - no account, no email. Pick
            a display name so people know a share is from you. You can back it up or protect it with
            a passkey later.
          </DialogDescription>

          <div className="mt-1">
            <label htmlFor="onboarding-name" className="text-label text-muted-foreground">
              Display name
            </label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toby"
              autoFocus
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void create()
                }
              }}
            />
          </div>

          <label className="flex items-start gap-2">
            <Checkbox
              checked={register}
              onCheckedChange={(v) => setRegister(v === true)}
              className="mt-0.5"
            />
            <span className="text-body-sm text-text">
              List me on <span className="font-medium">{DEFAULT_REGISTRY_LABEL}</span> so people can
              share with me by name.{' '}
              <a
                href={LEARN_MORE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Learn more
              </a>
              <span className="mt-0.5 block text-label text-muted-foreground">
                Publishes your public key + name. Uncheck to stay fully offline; you can change this
                later.
              </span>
            </span>
          </label>
          {error && <p className="text-body-sm text-danger">{error}</p>}
        </>
      )}

      <DialogFooter className="mt-1 items-center sm:justify-between">
        <Dots total={totalSteps} active={step} />
        <span className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft /> Back
          </Button>
          {existing ? (
            <Button onClick={onDone}>
              <Check /> Done
            </Button>
          ) : (
            <Button onClick={() => void create()} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Create identity
            </Button>
          )}
        </span>
      </DialogFooter>
    </>
  )
}
