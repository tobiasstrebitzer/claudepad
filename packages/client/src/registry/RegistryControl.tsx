// The registry affordance in the sidebar footer: connect an optional registry
// by URL (short links, share-by-name, archive). Honest by design - it names what
// the connected registry can and can't read before you rely on it.

import type { RegistryClient } from '@claudepad/registry-client'
import { Check, Loader2, Server, TriangleAlert, UploadCloud } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover'
import { useIdentityContext } from '../identity'
import { cn } from '../lib/cn'
import { useRegistry } from './RegistryProvider'

export function RegistryControl() {
  const { state } = useRegistry()
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left',
          'transition-colors hover:bg-accent-tint focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-tint text-muted-foreground">
          <Server className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-body-sm text-text">
            {state.status === 'connected' ? state.manifest.name : 'Connect a registry'}
          </span>
          <span className="truncate text-label text-muted-foreground">
            {state.status === 'connected'
              ? 'optional · short links & directory'
              : state.status === 'connecting'
                ? 'connecting…'
                : state.status === 'error'
                  ? 'connection failed'
                  : 'optional · off by default'}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[320px] z-100">
        <RegistryPanel />
      </PopoverContent>
    </Popover>
  )
}

function RegistryPanel() {
  const { url, state, configure, disconnect } = useRegistry()
  const [draft, setDraft] = React.useState(url)
  React.useEffect(() => setDraft(url), [url])

  const connect = () => configure(draft)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-medium text-text">Registry</h3>
        <p className="mt-0.5 text-label text-muted-foreground">
          Optional. Point claudepad at a registry to get short links, share by
          name, and (if the registry offers it) a shared archive. Sharing still
          works with no registry.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://registry.example.com"
          className="font-mono text-body-sm"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              connect()
            }
          }}
        />
        <Button variant="secondary" onClick={connect} disabled={draft.trim() === url.trim()}>
          Connect
        </Button>
      </div>

      {state.status === 'connecting' && (
        <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Connecting…
        </p>
      )}

      {state.status === 'error' && (
        <p className="flex items-start gap-1.5 text-body-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {state.message}
        </p>
      )}

      {state.status === 'connected' && <ConnectedSummary state={state} onDisconnect={disconnect} />}
      {state.status === 'connected' && state.manifest.directory?.enabled && (
        <PublishIdentity client={state.client} />
      )}
    </div>
  )
}

/** Publish your public card to the registry's directory so others can share by name. */
function PublishIdentity({ client }: { client: RegistryClient }) {
  const identity = useIdentityContext()
  const card = identity.publicCard()
  const defaultHandle = identity.state.status === 'unlocked' ? identity.state.identity.name : ''
  const [handle, setHandle] = React.useState(defaultHandle)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  if (!card) {
    return (
      <p className="text-label text-muted-foreground">
        Unlock your identity to publish it to the directory.
      </p>
    )
  }

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const entry = await client.publishIdentity(card, handle.trim() ? { handle: handle.trim() } : {})
      setDone(entry.handle)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg p-2.5">
      <p className="text-body-sm font-medium text-text">Publish your key</p>
      <p className="mt-0.5 text-label text-muted-foreground">
        List your public key in the directory so others can share with you by name.
        Only your public card is sent.
      </p>
      {done ? (
        <p className="mt-2 flex items-center gap-1.5 text-body-sm text-success">
          <Check className="size-4" /> Published as {done}
        </p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="handle (e.g. you@team)"
              className="text-body-sm"
              spellCheck={false}
            />
            <Button variant="secondary" onClick={publish} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UploadCloud className="size-4" />}
              Publish
            </Button>
          </div>
          {error && (
            <p className="mt-1.5 flex items-center gap-1.5 text-body-sm text-danger">
              <TriangleAlert className="size-4" /> {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ConnectedSummary({
  state,
  onDisconnect
}: {
  state: Extract<ReturnType<typeof useRegistry>['state'], { status: 'connected' }>
  onDisconnect: () => void
}) {
  const { manifest } = state
  const canRead = manifest.modes.includes('trusted')
  const zkOnly = !canRead
  return (
    <div className="rounded-md border border-border bg-bg p-2.5">
      <p className="flex items-center gap-1.5 text-body-sm text-text">
        <Check className="size-4 text-success" /> Connected to{' '}
        <span className="font-medium">{manifest.name}</span>
      </p>
      <ul className="mt-1.5 space-y-1 text-label text-muted-foreground">
        <li>
          {zkOnly
            ? 'Zero-knowledge: this registry stores only encrypted blobs - it cannot read your sessions.'
            : 'Supports a trusted mode: readable sessions you publish there can be read by the registry (you’ll be warned before any such upload).'}
        </li>
        {manifest.directory?.enabled && (
          <li>
            Directory enabled ({manifest.directory.assurance.join(', ')}) - you can share by
            name.
          </li>
        )}
        {canRead && manifest.trustedAtRest && <li>At rest: {manifest.trustedAtRest}</li>}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2 -ml-1" onClick={onDisconnect}>
        Disconnect
      </Button>
    </div>
  )
}
