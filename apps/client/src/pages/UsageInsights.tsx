// PRD-13 - Usage Insights: a local, private analytics view over the sessions the
// vault already reads. Where your tokens, cost, and time went - global vs per
// project - computed in the browser, nothing uploaded. Reached at #/usage.

import { Check, ChevronDown, FolderOpen, Info, Loader2, Upload } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../components/ui/DropdownMenu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip'
import type { Vault } from '../fs'
import { isVaultSupported } from '../fs/vault'
import { parseSession } from '../schema'
import { aggregateFile } from '../usage/aggregate'
import { HBar, HeatGrid } from '../usage/charts/primitives'
import { ModelBars, SessionHistogram, TokenTrend } from '../usage/charts/series'
import { DateRangeControl } from '../usage/DateRangeControl'
import { buildDashboard, type DashboardView, type UsageFilters } from '../usage/derive'
import { dataColor, formatCost, formatCount, formatHours, formatTokens, shortProject } from '../usage/format'
import { ASOF_NOTE } from '../usage/pricing'
import { EFFORT_DISCLAIMER, effortFormula } from '../usage/effort'
import { spendMethodLabel } from '../usage/attribution'
import type { FileAggregate } from '../usage/types'
import { useUsageSettings } from '../usage/useUsageSettings'
import { useVaultUsage } from '../usage/useVaultUsage'

interface UsageInsightsProps {
  vault?: Vault
}

export function UsageInsights({ vault }: UsageInsightsProps): React.JSX.Element {
  const connected = vault?.status === 'connected'
  const projects = React.useMemo(() => vault?.projects ?? [], [vault?.projects])
  const compute = useVaultUsage(projects, connected)
  const { settings, update } = useUsageSettings()

  // Non-Chromium / not-connected fallback: parse dropped/pasted files here.
  const [droppedFiles, setDroppedFiles] = React.useState<FileAggregate[]>()
  const files = connected ? compute.files : droppedFiles

  const [filters, setFilters] = React.useState<UsageFilters>({})

  const view = React.useMemo(
    () => (files ? buildDashboard(files, settings, filters) : undefined),
    [files, settings, filters]
  )

  if (connected && compute.status === 'computing') {
    return <Computing progress={compute.progress} total={projects.reduce((n, p) => n + p.sessions.length, 0)} />
  }

  if (!files || (view?.sessionCount === 0 && !droppedFiles)) {
    return (
      <ConnectPrompt
        supported={isVaultSupported()}
        canConnect={vault?.status === 'idle' || vault?.status === 'needs-permission'}
        onConnect={() => void vault?.connect()}
        onDropFiles={setDroppedFiles}
      />
    )
  }

  if (!view) return <ConnectPrompt supported={isVaultSupported()} canConnect={false} onConnect={() => {}} onDropFiles={setDroppedFiles} />

  return (
    <Dashboard
      view={view}
      filters={filters}
      onFilters={setFilters}
      settings={settings}
      onSettings={update}
      bounds={dayBounds(files)}
      partial={!connected}
    />
  )
}

interface DayBounds {
  minDay?: string
  maxDay?: string
}

function dayBounds(files: FileAggregate[]): DayBounds {
  let min: string | undefined
  let max: string | undefined
  for (const f of files) {
    for (const r of f.records) {
      if (min === undefined || r.day < min) min = r.day
      if (max === undefined || r.day > max) max = r.day
    }
  }
  const out: DayBounds = {}
  if (min) out.minDay = min
  if (max) out.maxDay = max
  return out
}

// ---------------------------------------------------------------------------

function Dashboard({
  view,
  filters,
  onFilters,
  settings,
  onSettings,
  bounds,
  partial
}: {
  view: DashboardView
  filters: UsageFilters
  onFilters: (f: UsageFilters) => void
  settings: ReturnType<typeof useUsageSettings>['settings']
  onSettings: ReturnType<typeof useUsageSettings>['update']
  bounds: DayBounds
  partial: boolean
}): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
      <Header view={view} filters={filters} onFilters={onFilters} bounds={bounds} partial={partial} />
      <MetricCards view={view} />
      <Trend view={view} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="When you work" subtitle="weekday x hour, by messages">
          <HeatGrid grid={view.heat} ariaLabel="Activity heatmap by weekday and hour" />
        </Panel>
        <Panel title="Tokens per session" subtitle="distribution">
          {view.sessionTokens.length === 0 ? <Empty>No sessions.</Empty> : <SessionHistogram values={view.sessionTokens} />}
        </Panel>
      </div>
      <ProjectTable view={view} filters={filters} onFilters={onFilters} />
      <div className="grid gap-4 md:grid-cols-2">
        <ModelBreakdown view={view} />
        <RealSpendPanel view={view} settings={settings} onSettings={onSettings} />
      </div>
    </div>
  )
}

function Header({
  view,
  filters,
  onFilters,
  bounds,
  partial
}: {
  view: DashboardView
  filters: UsageFilters
  onFilters: (f: UsageFilters) => void
  bounds: DayBounds
  partial: boolean
}): React.JSX.Element {
  const selected = filters.project ? shortProject(filters.project) : 'Global - all projects'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl text-text">Usage Insights</h1>
        <p className="text-sm text-muted-foreground">
          Where your tokens, cost, and time went. Computed locally - nothing leaves your browser.
          {partial && ' Showing the sessions you dropped in (partial view).'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="secondary" size="sm" className="max-w-[14rem] gap-1.5">
                <span className="truncate">{selected}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="max-h-80 max-w-[16rem] overflow-y-auto">
            <ProjectItem
              label="Global - all projects"
              active={!filters.project}
              onSelect={() => onFilters({ ...filters, project: undefined })}
            />
            {view.projects.map((p) => (
              <ProjectItem
                key={p.project}
                label={shortProject(p.project)}
                active={filters.project === p.project}
                onSelect={() => onFilters({ ...filters, project: p.project })}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DateRangeControl
          value={{ ...(filters.fromDay ? { fromDay: filters.fromDay } : {}), ...(filters.toDay ? { toDay: filters.toDay } : {}) }}
          onChange={(v) => onFilters({ ...filters, fromDay: v.fromDay, toDay: v.toDay })}
          {...(bounds.minDay ? { minDay: bounds.minDay } : {})}
          {...(bounds.maxDay ? { maxDay: bounds.maxDay } : {})}
        />
      </div>
    </div>
  )
}

function ProjectItem({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }): React.JSX.Element {
  return (
    <DropdownMenuItem onClick={onSelect} className="justify-between gap-3">
      <span className="truncate">{label}</span>
      {active && <Check className="size-4 shrink-0 text-accent" />}
    </DropdownMenuItem>
  )
}

function MetricCards({ view }: { view: DashboardView }): React.JSX.Element {
  const t = view.totals
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Metric
        label="Total tokens"
        value={formatTokens(t.input + t.output + t.cacheCreate + t.cacheRead)}
        sub={
          <Breakdown
            parts={[`${formatTokens(t.input)} in`, `${formatTokens(t.output)} out`, `${formatTokens(t.cacheCreate + t.cacheRead)} cache`]}
          />
        }
        info={`Input ${formatTokens(t.input)} · Output ${formatTokens(t.output)} · Cache write ${formatTokens(t.cacheCreate)} · Cache read ${formatTokens(t.cacheRead)}. Cache reads are re-reads of the cached prompt on every turn - usually the bulk of all tokens, and billed ~10x cheaper than fresh input.`}
      />
      <Metric
        label="Est. cost"
        value={view.cost.unpriced ? 'n/a' : formatCost(view.cost.total)}
        sub="API-equivalent"
        info={`Estimated, API-equivalent. ${ASOF_NOTE}`}
      />
      <Metric label="Sessions" value={formatCount(view.sessionCount)} sub={`${view.projectCount} project${view.projectCount === 1 ? '' : 's'}`} />
      <Metric label="Active days" value={formatCount(view.activeDays)} sub="with usage" />
      <Metric
        label="Top model"
        value={view.topModel ? shortModel(view.topModel.model) : '-'}
        sub={view.topModel ? `${Math.round(view.topModel.tokenShare * 100)}% tokens` : ''}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  info
}: {
  label: string
  value: string
  sub?: React.ReactNode
  info?: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {info && <InfoDot text={info} />}
      </div>
      <div className="mt-1 truncate font-serif text-xl text-text" title={value}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs leading-tight text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** A breakdown sub-line whose segments wrap as whole chips (never mid-value). */
function Breakdown({ parts }: { parts: string[] }): React.JSX.Element {
  return (
    <span className="flex flex-wrap gap-x-2">
      {parts.map((p) => (
        <span key={p} className="whitespace-nowrap">
          {p}
        </span>
      ))}
    </span>
  )
}

function Trend({ view }: { view: DashboardView }): React.JSX.Element {
  const [mode, setMode] = React.useState<'tokens' | 'cost'>('tokens')
  return (
    <Panel
      title="Tokens over time"
      subtitle={mode === 'tokens' ? 'per day, stacked by kind' : 'per day, estimated API-equivalent cost'}
      action={
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(['tokens', 'cost'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-[5px] px-2 py-0.5 capitalize transition-colors ${mode === m ? 'bg-accent-tint text-text' : 'text-muted-foreground'}`}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      {view.series.length === 0 ? <Empty>No dated activity in range.</Empty> : <TokenTrend series={view.series} mode={mode} />}
    </Panel>
  )
}

function ProjectTable({
  view,
  filters,
  onFilters
}: {
  view: DashboardView
  filters: UsageFilters
  onFilters: (f: UsageFilters) => void
}): React.JSX.Element {
  const maxTokens = Math.max(1, ...view.projects.map((p) => p.tokens))
  const showSpend = view.realSpendTotal > 0
  return (
    <Panel title="Projects" subtitle="click a project to scope the dashboard">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Project</th>
              <th className="py-1.5 pr-2 font-medium">Tokens</th>
              <th className="py-1.5 pr-2 text-right font-medium">Est. cost</th>
              {showSpend && <th className="py-1.5 pr-2 text-right font-medium">Real spend</th>}
              <th className="py-1.5 pr-2 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {view.projects.map((p, i) => {
              const selected = filters.project === p.project
              return (
                <tr
                  key={p.project}
                  className={`cursor-pointer border-b border-border/60 hover:bg-accent-tint ${selected ? 'bg-accent-tint' : ''}`}
                  onClick={() => onFilters({ ...filters, project: selected ? undefined : p.project })}
                >
                  <td className="max-w-[14rem] truncate py-1.5 pr-2 text-text" title={p.project}>
                    {shortProject(p.project)}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="w-14 tabular-nums text-text">{formatTokens(p.tokens)}</span>
                      <span className="w-20"><HBar fraction={p.tokens / maxTokens} color={dataColor(i)} /></span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                    {p.unpriced ? 'unpriced' : formatCost(p.cost)}
                  </td>
                  {showSpend && (
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{formatCost(p.realSpend)}</td>
                  )}
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{p.sessions}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filters.project && (
        <p className="mt-2 text-xs text-muted-foreground">
          Scoped to {shortProject(filters.project)} - every card and chart above reflects this project.
          Click the row again to clear.
        </p>
      )}
    </Panel>
  )
}

function ModelBreakdown({ view }: { view: DashboardView }): React.JSX.Element {
  return (
    <Panel title="Models" subtitle="tokens by model (cost on hover)">
      {view.models.length === 0 ? (
        <Empty>No model data.</Empty>
      ) : (
        <>
          <ModelBars models={view.models} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {view.models.map((m, i) => (
              <span key={m.model} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ backgroundColor: dataColor(i) }} />
                {shortModel(m.model)}: {m.unpriced ? 'unpriced' : formatCost(m.cost)}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

function RealSpendPanel({
  view,
  settings,
  onSettings
}: {
  view: DashboardView
  settings: ReturnType<typeof useUsageSettings>['settings']
  onSettings: ReturnType<typeof useUsageSettings>['update']
}): React.JSX.Element {
  return (
    <Panel title="Real spend & effort" subtitle="allocate your subscription, estimate effort">
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            Subscription / month
            <InfoDot text={spendMethodLabel({ weight: settings.spendWeight })} />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              min={0}
              className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-text"
              value={settings.monthlySubscription || ''}
              placeholder="0"
              onChange={(e) => onSettings({ monthlySubscription: Math.max(0, Number(e.target.value) || 0) })}
            />
          </span>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Weight by</span>
          <select
            className="rounded-md border border-border bg-surface px-2 py-1 text-text"
            value={settings.spendWeight}
            onChange={(e) => onSettings({ spendWeight: e.target.value === 'tokens' ? 'tokens' : 'cost' })}
          >
            <option value="cost">estimated cost</option>
            <option value="tokens">raw tokens</option>
          </select>
        </label>
        {view.realSpendTotal > 0 && (
          <div className="text-muted-foreground">
            Allocating <span className="text-text">{formatCost(view.realSpendTotal)}</span> across{' '}
            {view.activeMonths.length} active month{view.activeMonths.length === 1 ? '' : 's'} - an allocation, not a bill.
          </div>
        )}
        <div className="h-px bg-border" />
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            Effort equivalent
            <InfoDot text={`${EFFORT_DISCLAIMER} Formula: ${effortFormula(settings.effort)}.`} />
          </span>
          <span className="font-serif text-lg text-text">~{formatHours(view.effortHours)}</span>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Output tokens / hour</span>
          <input
            type="number"
            min={1}
            className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right text-text"
            value={settings.effort.outputTokensPerHour}
            onChange={(e) =>
              onSettings({ effort: { outputTokensPerHour: Math.max(1, Number(e.target.value) || 1) } })
            }
          />
        </label>
      </div>
    </Panel>
  )
}

// --- shared chrome ---------------------------------------------------------

function Panel({
  title,
  subtitle,
  action,
  children
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-text">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>
}

function InfoDot({ text }: { text: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="text-muted-foreground hover:text-text" aria-label="More info">
            <Info className="size-3" />
          </button>
        }
      />
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

// --- empty / loading states ------------------------------------------------

function Computing({ progress, total }: { progress: number; total: number }): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <Loader2 className="size-6 animate-spin text-accent" />
      <div className="text-sm text-text">Reading sessions…</div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">
        {Math.round(progress * 100)}% of {formatCount(total)} sessions
      </div>
    </div>
  )
}

function ConnectPrompt({
  supported,
  canConnect,
  onConnect,
  onDropFiles
}: {
  supported: boolean
  canConnect: boolean
  onConnect: () => void
  onDropFiles: (files: FileAggregate[]) => void
}): React.JSX.Element {
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const ingest = React.useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      setBusy(true)
      const out: FileAggregate[] = []
      for (const file of Array.from(fileList)) {
        try {
          const { session } = await parseSession(file, { preserveRaw: false })
          out.push(aggregateFile(session))
        } catch {
          // skip unreadable file
        }
      }
      setBusy(false)
      onDropFiles(out)
    },
    [onDropFiles]
  )

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <FolderOpen className="size-8 text-muted-foreground" />
      <h1 className="font-serif text-xl text-text">Usage Insights</h1>
      <p className="text-sm text-muted-foreground">
        See where your tokens, cost, and time went - global vs per project. Everything is computed in
        your browser; nothing is uploaded.
      </p>
      {supported && canConnect && (
        <Button onClick={onConnect}>
          <FolderOpen />
          Connect your ~/.claude folder
        </Button>
      )}
      <div className="flex w-full flex-col items-center gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          Drop session files
        </Button>
        <p className="text-xs text-muted-foreground">
          {supported
            ? 'Or analyze a subset without connecting.'
            : 'Folder-connect needs a Chromium browser; drop .jsonl files for a partial view.'}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jsonl,.json,.ndjson"
        className="sr-only"
        data-testid="usage-file-input"
        onChange={(e) => {
          void ingest(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
