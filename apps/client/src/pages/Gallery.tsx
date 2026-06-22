import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  Lock,
  Moon,
  Plus,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import * as React from 'react'
import { Wordmark } from '../components/brand/Wordmark'
import { ReadingColumn } from '../components/shell/AppShell'
import { Button } from '../components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Checkbox } from '../components/ui/Checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../components/ui/Collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger
} from '../components/ui/Dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger
} from '../components/ui/Drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/DropdownMenu'
import { Input } from '../components/ui/Input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger
} from '../components/ui/Popover'
import { ScrollArea } from '../components/ui/ScrollArea'
import { Separator } from '../components/ui/Separator'
import { Skeleton } from '../components/ui/Skeleton'
import { Switch } from '../components/ui/Switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { Textarea } from '../components/ui/Textarea'
import { Toaster } from '../components/ui/Sonner'
import { toast } from 'sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../components/ui/Tooltip'
import { contrastRatio, ratioLabel } from '../lib/contrast'
import { getTheme, setTheme, type ResolvedTheme } from '../lib/theme'
import {
  getViewerTheme,
  setViewerTheme,
  VIEWER_THEMES,
  type ViewerTheme
} from '../lib/viewer-theme'

// Read a set of CSS custom properties off <html> for the current theme.
function useCssVars(names: string[], dep: unknown): Record<string, string> {
  return React.useMemo(() => {
    const out: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const cs = getComputedStyle(document.documentElement)
      for (const n of names) out[n] = cs.getPropertyValue(n).trim()
    }
    return out
    // `names` is a stable module constant; re-read only when the theme (`dep`) changes.
  }, [dep])
}

const SURFACE_TOKENS = ['--bg', '--surface', '--sidebar', '--border']
const TEXT_TOKENS = ['--text', '--text-muted', '--accent', '--accent-hover']
const STATUS_TOKENS = ['--success', '--warn', '--danger', '--ring']
const ALL_TOKENS = [...SURFACE_TOKENS, ...TEXT_TOKENS, ...STATUS_TOKENS, '--accent-fg']

// Documented contrast pairings (mirrors §7.1 targets) - also asserted by CI
// (scripts/check-contrast.mjs). NOTE: text-on-accent is held to AA-large (3:1):
// the clay accent is preserved as approved, and accent fills only ever carry
// large/bold button labels (DECISIONS - accent contrast).
const PAIRINGS: { fg: string; bg: string; min: number; note: string }[] = [
  { fg: '--text', bg: '--bg', min: 4.5, note: 'body on canvas' },
  { fg: '--text', bg: '--surface', min: 4.5, note: 'body on surface' },
  { fg: '--text-muted', bg: '--bg', min: 4.5, note: 'muted on canvas' },
  { fg: '--accent-fg', bg: '--accent', min: 3, note: 'bold label on accent (AA-large)' },
  { fg: '--accent', bg: '--bg', min: 3, note: 'accent on canvas (UI)' }
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-sans text-heading-2 font-semibold text-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
      <span
        className="size-9 shrink-0 rounded-sm border border-border"
        style={{ background: `var(${name})` }}
      />
      <span className="flex flex-col">
        <code className="font-mono text-code text-text">{name}</code>
        <span className="text-label text-muted-foreground">{value || '-'}</span>
      </span>
    </div>
  )
}

export function Gallery() {
  const [resolved, setResolved] = React.useState<ResolvedTheme>(
    () =>
      (document.documentElement.getAttribute('data-theme') as ResolvedTheme) ?? 'light'
  )
  const [palette, setPalette] = React.useState<ViewerTheme>(() => getViewerTheme())
  // Re-read tokens whenever EITHER axis (mode or palette) changes.
  const vars = useCssVars(ALL_TOKENS, `${resolved}:${palette}`)

  const setMode = (mode: 'light' | 'dark') => {
    setTheme(mode)
    setResolved(mode)
  }
  const setPaletteMode = (p: ViewerTheme) => {
    setViewerTheme(p)
    setPalette(p)
  }

  const icons = [
    Upload,
    Clipboard,
    ShieldCheck,
    Lock,
    Eye,
    EyeOff,
    Share2,
    Check,
    X,
    Sun,
    Moon,
    Plus,
    Search,
    Settings,
    Trash2
  ]

  return (
    <>
      <ReadingColumn className="max-w-4xl">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-body-sm text-muted-foreground">Design system</p>
            <h1 className="mt-1 font-serif text-display-lg text-text">Gallery</h1>
          </div>
          {/* Light/dark + palette switches at the top (FR-23). */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {(['light', 'dark'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    'rounded-[5px] px-3 py-1 text-body-sm capitalize transition-colors ' +
                    (resolved === m
                      ? 'bg-accent text-accent-fg'
                      : 'text-muted-foreground hover:text-text')
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {VIEWER_THEMES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaletteMode(p)}
                  className={
                    'rounded-[5px] px-3 py-1 text-body-sm capitalize transition-colors ' +
                    (palette === p
                      ? 'bg-accent text-accent-fg'
                      : 'text-muted-foreground hover:text-text')
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Mode <code className="font-mono text-code">{getTheme()}</code> · resolved{' '}
          <code className="font-mono text-code">{resolved}</code> · palette{' '}
          <code className="font-mono text-code">{palette}</code>
        </p>

        <Section title="Color tokens">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_TOKENS.map((t) => (
              <Swatch key={t} name={t} value={vars[t] ?? ''} />
            ))}
          </div>
        </Section>

        <Section title="Contrast (WCAG)">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-body-sm">
              <thead className="bg-sidebar text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Pairing</th>
                  <th className="px-3 py-2 text-left font-medium">Ratio</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                  <th className="px-3 py-2 text-left font-medium">Pass</th>
                </tr>
              </thead>
              <tbody>
                {PAIRINGS.map((p) => {
                  const ratio = contrastRatio(vars[p.fg] ?? '', vars[p.bg] ?? '')
                  const pass = ratio >= p.min
                  return (
                    <tr key={p.note} className="border-t border-border">
                      <td className="px-3 py-2 text-text">
                        <span
                          className="mr-2 inline-block rounded px-1.5 py-0.5 text-label"
                          style={{ background: `var(${p.bg})`, color: `var(${p.fg})` }}
                        >
                          Aa
                        </span>
                        {p.note}
                      </td>
                      <td className="px-3 py-2 font-mono text-code text-text">
                        {ratioLabel(ratio)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">≥ {p.min}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={pass ? 'outline' : 'destructive'}
                          className={
                            pass ? 'border-transparent bg-success/15 text-success' : undefined
                          }
                        >
                          {pass ? 'pass' : 'fail'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Type scale">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-6">
            <p className="font-serif text-display-xl text-text">Afternoon, Toby</p>
            <p className="font-serif text-display-lg text-text">Display large (serif)</p>
            <p className="font-serif text-heading-1 text-text">Heading 1 (serif)</p>
            <p className="text-heading-2 font-semibold text-text">
              Heading 2 (sans semibold)
            </p>
            <p className="text-heading-3 font-semibold text-text">
              Heading 3 (sans semibold)
            </p>
            <p className="text-body text-text">
              Body - the default for UI and transcript reading.
            </p>
            <p className="text-body-sm text-muted-foreground">
              Body small - secondary text and captions.
            </p>
            <p className="text-label uppercase tracking-[0.02em] text-muted-foreground">
              Label · sidebar sections
            </p>
            <p className="font-mono text-code text-text">
              const code = &quot;[AWS_KEY ••••••••(20)]&quot;; // mono + placeholders
            </p>
          </div>
        </Section>

        <Section title="Iconography (Lucide)">
          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-6 text-text">
            {icons.map((Icon, i) => (
              <Icon key={i} className="size-5" strokeWidth={1.5} />
            ))}
          </div>
        </Section>

        <Section title="Wordmark">
          <div className="flex flex-wrap items-center gap-8 rounded-lg border border-border bg-surface p-6">
            <Wordmark size="full" variant="spark" />
            <Wordmark size="small" variant="mono" />
            <div className="flex items-center gap-3 text-text">
              <Wordmark size="mark" variant="spark" />
              <Wordmark size="mark" variant="mono" />
            </div>
            <span className="text-accent">
              <Wordmark size="mark" variant="mono" />
            </span>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="default">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Danger</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">
                <Share2 />
                Small
              </Button>
              <Button size="default">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Settings">
                <Settings />
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-6">
            <Badge variant="outline" className="bg-sidebar text-muted-foreground">neutral</Badge>
            <Badge variant="outline" className="border-transparent bg-accent-tint text-accent">accent</Badge>
            <Badge variant="outline" className="border-transparent bg-success/15 text-success">success</Badge>
            <Badge variant="outline" className="border-transparent bg-warn/15 text-warn">caution</Badge>
            <Badge variant="destructive">danger</Badge>
            <Badge variant="outline" className="bg-surface font-mono text-muted-foreground">AWS_KEY ••••••••(20)</Badge>
          </div>
        </Section>

        <Section title="Inputs & controls">
          <div className="grid max-w-md gap-4 rounded-lg border border-border bg-surface p-6">
            <Input placeholder="Recipient public key (cp-pub-…)" />
            <Input placeholder="Disabled" disabled />
            <Separator />
            <label className="flex items-center justify-between text-body-sm text-text">
              Reveal secrets to this recipient
              <Switch />
            </label>
            <label className="flex items-center justify-between text-body-sm text-text">
              Defaulted on
              <Switch defaultChecked />
            </label>
          </div>
        </Section>

        <Section title="Textarea">
          <div className="max-w-md rounded-lg border border-border bg-surface p-6">
            <Textarea placeholder="Paste a Claude Code session (.jsonl) here…" rows={4} />
          </div>
        </Section>

        <Section title="Checkbox">
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-6">
            <label className="flex items-center gap-2 text-body-sm text-text">
              <Checkbox defaultChecked />
              Checked
            </label>
            <label className="flex items-center gap-2 text-body-sm text-text">
              <Checkbox />
              Unchecked
            </label>
            <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Checkbox disabled />
              Disabled
            </label>
            <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Checkbox defaultChecked disabled />
              Disabled checked
            </label>
          </div>
        </Section>

        <Section title="Tabs">
          <div className="rounded-lg border border-border bg-surface p-6">
            <Tabs defaultValue="prettify">
              <TabsList>
                <TabsTrigger value="prettify">Prettify</TabsTrigger>
                <TabsTrigger value="share">Share</TabsTrigger>
                <TabsTrigger value="playback">Playback</TabsTrigger>
              </TabsList>
              <TabsContent value="prettify">
                Drop a raw session and see it cleaned up.
              </TabsContent>
              <TabsContent value="share">
                Encrypt the transcript to a recipient&apos;s public key.
              </TabsContent>
              <TabsContent value="playback">Replay the session turn by turn.</TabsContent>
            </Tabs>
          </div>
        </Section>

        <Section title="Tooltip">
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6">
              <Tooltip>
                <TooltipTrigger render={<Button variant="secondary">Hover me</Button>} />
                <TooltipContent>Encrypted to recipient only</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </Section>

        <Section title="Popover">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6">
            <Popover>
              <PopoverTrigger
                render={<Button variant="secondary">Open popover</Button>}
              />
              <PopoverContent>
                <PopoverTitle className="text-heading-3 font-semibold text-text">
                  Key fingerprint
                </PopoverTitle>
                <PopoverDescription className="mt-1 text-body-sm text-muted-foreground">
                  Compare these emoji + hex out of band to verify the recipient.
                </PopoverDescription>
                <p className="mt-2 font-mono text-code text-text">
                  🔑🌿🛰️🎯🔒🪐 · a1b2c3d4
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </Section>

        <Section title="Dialog & Drawer">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6">
            <Dialog>
              <DialogTrigger render={<Button>Open dialog</Button>} />
              <DialogContent>
                <DialogTitle>Share this session</DialogTitle>
                <DialogDescription>
                  This produces a self-contained encrypted blob. Only the invited
                  recipient can read it.
                </DialogDescription>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary">Cancel</Button>} />
                  <DialogClose render={<Button>Encrypt</Button>} />
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Drawer direction="right">
              <DrawerTrigger asChild>
                <Button variant="secondary">Open drawer (right)</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerTitle>Recipients</DrawerTitle>
                <DrawerDescription>Manage who can decrypt this blob.</DrawerDescription>
                <div className="mt-4 flex-1" />
                <DrawerClose asChild>
                  <Button variant="secondary">Close</Button>
                </DrawerClose>
              </DrawerContent>
            </Drawer>
          </div>
        </Section>

        <Section title="Dropdown menu">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="secondary">Actions</Button>}
              />
              <DropdownMenuContent>
                <DropdownMenuLabel>Session</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Share2 />
                  Share…
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Eye />
                  Reveal secrets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Trash2 />
                  Discard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Section>

        <Section title="Scroll area">
          <div className="rounded-lg border border-border bg-surface p-6">
            <ScrollArea className="h-40 w-full rounded-md border border-border">
              <div className="space-y-2 p-3 text-body-sm text-text">
                {Array.from({ length: 24 }, (_, i) => (
                  <p key={i} className="font-mono text-code">
                    line {i + 1} - overflowing transcript content to scroll through
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Section>

        <Section title="Toast">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-6">
            <Button
              variant="secondary"
              onClick={() =>
                toast('Blob copied', {
                  description: 'The encrypted share is on your clipboard.'
                })
              }
            >
              Show toast
            </Button>
          </div>
        </Section>

        <Section title="Skeleton">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        </Section>

        <Section title="Collapsible">
          <div className="rounded-lg border border-border bg-surface p-6">
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger
                render={<Button variant="ghost">Show tool output</Button>}
              />
              <CollapsibleContent>
                <pre className="mt-2 rounded-md bg-sidebar p-3 font-mono text-code text-text">
                  $ node poc/verify.mjs{'\n'}21/21 checks passed
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </Section>

        <Section title="Avatar">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-6">
            <Avatar>
              {/* Self-contained data-URI image - no third-party fetch (no-phone-home posture). */}
              <AvatarImage
                src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2040%2040'%3E%3Crect%20width='40'%20height='40'%20fill='%23CC785C'/%3E%3Ctext%20x='20'%20y='27'%20font-family='sans-serif'%20font-size='18'%20fill='white'%20text-anchor='middle'%3Ecp%3C/text%3E%3C/svg%3E"
                alt="Sample avatar"
              />
              <AvatarFallback>CP</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src="" alt="" />
              <AvatarFallback>TS</AvatarFallback>
            </Avatar>
          </div>
        </Section>
      </ReadingColumn>
      <Toaster />
    </>
  )
}
