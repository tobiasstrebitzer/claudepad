import {
  ArrowRight,
  Code2,
  Eye,
  FileText,
  KeyRound,
  Play,
  Server,
  ShieldCheck
} from 'lucide-react'
import * as React from 'react'
import { ReadingColumn } from '../components/shell/AppShell'
import { Wordmark } from '../components/brand/Wordmark'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Separator } from '../components/ui/Separator'
import { DEFAULT_REGISTRY_LABEL } from '../registry'

const REPO_URL = 'https://github.com/tobiasstrebitzer/claudepad'

// What claudepad does, in one screen. Kept parallel to the README's "What it
// does" so the two never drift.
const FEATURES = [
  {
    icon: FileText,
    title: 'Prettify',
    body: 'Drop or paste a session, or connect your ~/.claude folder once and browse every project from the sidebar. Messages, tools, thinking, and code render cleanly. Fully offline.'
  },
  {
    icon: Play,
    title: 'Play back',
    body: 'Replay a session turn by turn with a scrubber, speed control, and a presentation pace that auto-times each turn for reading aloud.'
  },
  {
    icon: KeyRound,
    title: 'Mint an identity',
    body: 'Generate an ECDH keypair right in your browser - no account, no email. Back it up, or lock it behind your device passkey (WebAuthn PRF).'
  },
  {
    icon: ShieldCheck,
    title: 'Share, trustlessly',
    body: 'Encrypt a session to one recipient’s public key. A mandatory review step redacts detected secrets first; you choose, per recipient, transcript-only or transcript-and-secrets. The output is a self-contained blob you carry anywhere.'
  },
  {
    icon: Eye,
    title: 'Receive',
    body: 'Paste a blob, decrypt it with your identity (non-recipients get nothing), verify the sender’s fingerprint, and read it. No link that phones home.'
  }
] as const

const PRINCIPLES = [
  {
    title: 'No server, nothing to trust',
    body: 'Parsing, identity, encryption, and decryption all run in your browser. "The host can’t read it" is true because there is no host in the data path.'
  },
  {
    title: 'The blob is the message',
    body: 'A share is a self-contained encrypted artifact you carry - not a link pointing back at a server that could log, expire, or leak it.'
  },
  {
    title: 'Trust is verifiable',
    body: 'A self-claimed name is paired with a key fingerprint (6 emoji + hex) you can compare out of band, so you know who you are really encrypting to.'
  },
  {
    title: 'Zero-dependency crypto',
    body: 'WebCrypto only - AES-256-GCM, ECDH P-256, HKDF, SHA-256. No crypto library to audit around. The core ships with an end-to-end conformance suite.'
  },
  {
    title: 'A single static bundle',
    body: 'Self-hosting is "serve some files." No database, no API, no accounts, fonts self-hosted, no third-party runtime fetches.'
  }
] as const

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label uppercase tracking-[0.06em] text-muted-foreground">{children}</p>
  )
}

export function About() {
  return (
    <ReadingColumn className="max-w-3xl pb-20">
      {/* Hero */}
      <Wordmark size="full" variant="spark" />
      <h1 className="mt-6 font-serif text-display-lg leading-tight text-text">
        Read and share Claude Code sessions, privately.
      </h1>
      <p className="mt-4 text-body leading-relaxed text-muted-foreground">
        claudepad turns a raw Claude Code session (<code className="font-mono text-code">
          ~/.claude/projects/*.jsonl
        </code>) into a clean, readable artifact you can explore, play back, and share -
        encrypted to one specific person. Everything runs in your browser, so there is nothing to
        trust with your data.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-transparent bg-accent-tint text-accent">
          Open source (MIT)
        </Badge>
        <Badge variant="outline" className="bg-sidebar text-muted-foreground">
          Client-side only
        </Badge>
        <Badge variant="outline" className="bg-sidebar text-muted-foreground">
          Early dev demo
        </Badge>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button render={<a href="#/" />}>
          Try it <ArrowRight />
        </Button>
        <Button variant="secondary" render={<a href={REPO_URL} target="_blank" rel="noreferrer" />}>
          <Code2 /> View on GitHub
        </Button>
      </div>

      {/* What it does */}
      <section className="mt-14">
        <Eyebrow>What it does</Eyebrow>
        <div className="mt-5 grid gap-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-4 rounded-lg border border-border bg-surface p-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-tint text-accent">
                <Icon className="size-4.5" strokeWidth={1.5} />
              </span>
              <div>
                <h3 className="text-heading-3 font-semibold text-text">{title}</h3>
                <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why it's built this way */}
      <section className="mt-14">
        <Eyebrow>Why it’s built this way</Eyebrow>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map(({ title, body }) => (
            <div key={title}>
              <h3 className="text-heading-3 font-semibold text-text">{title}</h3>
              <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator className="my-14" />

      {/* The optional registry - the "Learn more" target from onboarding */}
      <section>
        <span className="grid size-9 place-items-center rounded-full bg-accent-tint text-accent">
          <Server className="size-4.5" strokeWidth={1.5} />
        </span>
        <h2 className="mt-4 font-serif text-heading-1 text-text">The optional registry</h2>
        <p className="mt-3 text-body leading-relaxed text-muted-foreground">
          Sharing works fully offline - the encrypted blob is self-contained, and you can carry it
          over Slack, email, or a file with no service involved. A <em>registry</em> is an opt-in
          convenience on top of that: a place to host a blob behind a short link, and a directory
          so people can share with you by name instead of pasting a long public key.
        </p>
        <ul className="mt-4 grid gap-3">
          {[
            ['Zero-knowledge by default', 'A registry stores opaque blobs it cannot read and a public-key directory. It never sees your sessions or your private key.'],
            ['Off until you ask', 'Nothing is published when you mint an identity. Listing yourself is an explicit, reversible choice - leave it unchecked to stay entirely offline.'],
            ['Swappable and self-hostable', `It is an open spec, not a lock-in. ${DEFAULT_REGISTRY_LABEL} is the recommended default, but you can point at your own or run without one.`]
          ].map(([title, body]) => (
            <li key={title} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-heading-3 font-semibold text-text">{title}</p>
              <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <Separator className="my-14" />

      {/* Open source + honest status */}
      <section>
        <Eyebrow>Open source &amp; honest about it</Eyebrow>
        <h2 className="mt-3 font-serif text-heading-1 text-text">A demo, not a vault - yet.</h2>
        <p className="mt-3 text-body leading-relaxed text-muted-foreground">
          claudepad is MIT-licensed and self-hostable: the whole thing is one static bundle, so
          hosting your own copy is "serve some files." It is an early developer demo, shared to
          gather feedback and find the use cases worth building. The crypto core is small and
          auditable on purpose, but it has not had an independent security review yet - treat it as
          a capable demo rather than a vault for your most sensitive secrets. An audit is welcome.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="secondary" render={<a href={REPO_URL} target="_blank" rel="noreferrer" />}>
            <Code2 /> Source &amp; issues
          </Button>
          <Button variant="ghost" render={<a href="#/" />}>
            Open the app <ArrowRight />
          </Button>
        </div>
      </section>
    </ReadingColumn>
  )
}
