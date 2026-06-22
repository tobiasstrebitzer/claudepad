import { ArrowRight, Clipboard, ShieldCheck, Upload } from 'lucide-react'
import { ReadingColumn } from '../components/shell/AppShell'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'

// Home / empty-state (scaffold). The real ingest surface is PRD-04; this is the
// design-foundation demo: serif greeting, value line, and a drop/paste affordance.
export function Home() {
  return (
    <ReadingColumn>
      <p className="text-body-sm text-muted-foreground">Afternoon</p>
      <h1 className="mt-1 font-serif text-display-xl text-text">Welcome back, Toby</h1>
      <p className="mt-4 max-w-prose text-body text-muted-foreground">
        Drop a Claude Code session to see it beautifully - then share it encrypted to one
        person, with no server in the middle.
      </p>

      <div className="mt-8 rounded-lg border border-dashed border-border bg-surface p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-tint text-accent">
          <Upload className="size-5" />
        </div>
        <p className="mt-4 text-body text-text">
          Drop a <code className="font-mono text-code">.jsonl</code> session here
        </p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          or paste a transcript from your clipboard
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="default" size="default">
            <Upload />
            Open a session
          </Button>
          <Button variant="secondary" size="default">
            <Clipboard />
            Paste
          </Button>
        </div>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="text-body-sm text-text">
            Trustless by design{' '}
            <Badge variant="outline" className="ml-1 border-transparent bg-success/15 text-success">
              no server
            </Badge>
          </p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Parsing, identity, and encryption all happen in your browser. Sharing encrypts
            to a recipient&rsquo;s public key - the blob is inert to everyone else.
          </p>
        </div>
      </div>

      <a
        href="#/gallery"
        className="mt-8 inline-flex items-center gap-1 text-body-sm text-accent hover:underline underline-offset-4"
      >
        View the design system gallery
        <ArrowRight className="size-4" />
      </a>
    </ReadingColumn>
  )
}
