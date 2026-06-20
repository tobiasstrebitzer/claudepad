// The identity panel (PRD-10 §4.2/§4.3) — renders the right surface for each of
// the three states. Honest throughout: names are self-claimed (FR-5/FR-12), the
// secret is the only copy (no server recovery, FR-3/FR-18), and device protection
// degrades with a clear note where WebAuthn can't run (FR-13).

import * as React from 'react';
import {
  Check,
  Copy,
  Download,
  Fingerprint as FingerprintIcon,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { useCopy } from '../ingest/useCopy';
import { Fingerprint } from './Fingerprint';
import { useIdentityContext } from './IdentityProvider';

/** Run an async action with pending + friendly-error state for the UI. */
function useAction(): {
  pending: boolean;
  error: string | null;
  run: (fn: () => Promise<void>) => Promise<void>;
  clearError: () => void;
} {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, clearError: () => setError(null) };
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-body-sm text-danger"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function IdentityPanel() {
  const { state } = useIdentityContext();
  switch (state.status) {
    case 'loading':
      return (
        <div className="flex items-center gap-2 text-body-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading identity…
        </div>
      );
    case 'none':
      return <NonePanel />;
    case 'locked':
      return <LockedPanel name={state.name} />;
    case 'unlocked':
      return <UnlockedPanel />;
  }
}

function NonePanel() {
  const { mint, importSecret } = useIdentityContext();
  const [name, setName] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const mintAction = useAction();
  const importAction = useAction();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="font-serif text-heading-3 text-text">Set up your identity</h2>
        <p className="text-body-sm text-muted">
          A keypair minted in your browser — no account, nothing uploaded. You’ll
          need it to share sessions and to receive them back.
        </p>
      </header>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void mintAction.run(() => mint(name));
        }}
      >
        <label className="text-label text-muted" htmlFor="cp-id-name">
          Display name
        </label>
        <div className="flex gap-2">
          <Input
            id="cp-id-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Toby"
            autoComplete="off"
          />
          <Button type="submit" disabled={mintAction.pending} className="shrink-0">
            {mintAction.pending ? <Loader2 className="animate-spin" /> : null}
            Create
          </Button>
        </div>
        {mintAction.error && <ErrorNote>{mintAction.error}</ErrorNote>}
      </form>

      <div className="flex items-center gap-3 text-label text-muted">
        <span className="h-px flex-1 bg-border" /> or import a backup{' '}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void importAction.run(() => importSecret(secret));
        }}
      >
        <Textarea
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Paste your cp-id-… identity secret"
          className="min-h-[64px] font-mono text-body-sm"
          spellCheck={false}
        />
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={importAction.pending || !secret.trim()}
        >
          {importAction.pending ? <Loader2 className="animate-spin" /> : null}
          Import identity
        </Button>
        {importAction.error && <ErrorNote>{importAction.error}</ErrorNote>}
      </form>
    </div>
  );
}

function LockedPanel({ name }: { name: string }) {
  const { unlock, forget } = useIdentityContext();
  const unlockAction = useAction();
  const forgetAction = useAction();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 font-serif text-heading-3 text-text">
          <KeyRound className="size-4 text-muted" /> Locked
        </h2>
        <p className="text-body-sm text-muted">
          Identity <span className="font-medium text-text">{name}</span> is locked
          by your device. Unlock with your fingerprint / Face ID / security key.
        </p>
      </header>

      <Button
        className="w-full"
        disabled={unlockAction.pending}
        onClick={() => void unlockAction.run(unlock)}
      >
        {unlockAction.pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Unlock with device
      </Button>
      {unlockAction.error && <ErrorNote>{unlockAction.error}</ErrorNote>}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted"
        disabled={forgetAction.pending}
        onClick={() => {
          if (
            window.confirm(
              'Forget this identity on this browser? Recovery then requires your exported cp-id-… secret.',
            )
          ) {
            void forgetAction.run(forget);
          }
        }}
      >
        <Trash2 /> Forget on this browser
      </Button>
      {forgetAction.error && <ErrorNote>{forgetAction.error}</ErrorNote>}
    </div>
  );
}

function UnlockedPanel() {
  const { state, deviceAvailable, publicCard, exportSecret, protect, removeProtection, signOut } =
    useIdentityContext();
  const [copiedCard, copyCard] = useCopy();
  const protectAction = useAction();
  const signOutAction = useAction();
  // Footgun guard (OQ-B): nudge a backup before locking behind a device.
  const [backedUp, setBackedUp] = React.useState(false);

  if (state.status !== 'unlocked') return null;
  const { identity, protected: isProtected } = state;
  const card = publicCard() ?? '';

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="truncate text-body">
            Signed in as <span className="font-medium">{identity.name}</span>
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted"
          disabled={signOutAction.pending}
          onClick={() => {
            if (
              isProtected ||
              window.confirm(
                'Sign out removes this unprotected identity from this browser. Make sure you’ve downloaded your secret first.',
              )
            ) {
              void signOutAction.run(signOut);
            }
          }}
        >
          <LogOut /> {isProtected ? 'Lock' : 'Sign out'}
        </Button>
      </header>

      {/* Public key card — safe to post */}
      <section className="space-y-1.5">
        <p className="text-label text-muted">
          Your public key — give to friends, safe to post
        </p>
        <div className="flex items-stretch gap-2">
          <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-body-sm text-text">
            {card}
          </code>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Copy public key"
            onClick={() => copyCard(card)}
          >
            {copiedCard ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
      </section>

      {/* Fingerprint — read aloud to verify */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-label text-muted">
          <FingerprintIcon className="size-3.5" /> Your fingerprint — read aloud to verify
        </p>
        <Fingerprint pub={identity.pub} />
        <p className="text-label text-muted">
          The name above is self-claimed. Trust comes from matching this
          fingerprint out of band.
        </p>
      </section>

      {/* Backup */}
      <section className="space-y-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => {
            const secret = exportSecret();
            if (secret) {
              downloadText(`claudepad-identity-${identity.name}.txt`, secret);
              setBackedUp(true);
            }
          }}
        >
          <Download /> Download identity secret
        </Button>
        <p className="flex items-start gap-1.5 text-label text-muted">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
          This is your only key. No server can recover it — back it up.
        </p>
      </section>

      {/* Device protection */}
      <section className="space-y-1.5 border-t border-border pt-4">
        <p className="flex items-center gap-1.5 text-label text-muted">
          <ShieldCheck className="size-3.5" /> Device protection
        </p>
        {!deviceAvailable ? (
          <p className="text-label text-muted">
            Needs a real origin with passkey support (works on localhost / a
            self-hosted site, not <code className="font-mono">file://</code>).
          </p>
        ) : isProtected ? (
          <>
            <p className="text-body-sm text-text">
              Locked behind this device’s passkey.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted"
              disabled={protectAction.pending}
              onClick={() => void protectAction.run(removeProtection)}
            >
              <ShieldOff /> Remove device protection
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="w-full"
              disabled={protectAction.pending || !backedUp}
              onClick={() => void protectAction.run(protect)}
            >
              {protectAction.pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Protect with this device
            </Button>
            {!backedUp && (
              <p className="text-label text-muted">
                Download your secret first — if a device unlock ever fails, the
                backup is the only way back in.
              </p>
            )}
          </>
        )}
        {protectAction.error && <ErrorNote>{protectAction.error}</ErrorNote>}
      </section>

      {signOutAction.error && <ErrorNote>{signOutAction.error}</ErrorNote>}
    </div>
  );
}
