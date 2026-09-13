// @/usage - QuotaPanel.tsx
//
// "How much of my plan did that actually use?" - the rate-limit view.
//
// Deliberately separate from the cost cards, and deliberately not bound to the
// dashboard's date filter: limits are about windows in real time (the last five
// hours, this week), not about whatever range you happen to be inspecting.
//
// Honesty is the whole design here. The budgets are reverse-engineered from one
// account, so the panel says so, lets you edit them, and prefers values measured
// from your own quota log the moment you provide one.

import { AlertTriangle, FolderOpen, Info, Upload } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip'
import { formatCost, formatCount } from './format'
import {
  buildQuota,
  MAX_20X,
  meteredSpend,
  WEEK_MS,
  type QuotaPlan,
  type QuotaView
} from './quota'
import { calibrate, calibratedPlan, latestSample, type QuotaSample } from './quotaLog'
import type { QuotaSettings, UsageSettings } from './derive'
import type { FileAggregate } from './types'
import { isFolderPickerSupported, useQuotaLog } from './useQuotaLog'

interface Props {
  files: readonly FileAggregate[]
  settings: UsageSettings
  onSettings: (patch: Partial<UsageSettings>) => void
  /** Injectable for tests; defaults to now. */
  now?: number
}

/** Apply hand-edited budgets over whichever plan is in play. */
function withOverrides(plan: QuotaPlan, q: QuotaSettings | undefined): QuotaPlan {
  if (!q) return plan
  const next: QuotaPlan = { ...plan }
  if (q.session && q.session > 0) next.session = q.session
  if (q.weekly && q.weekly > 0) next.weekly = q.weekly
  if (plan.scoped && q.scoped && q.scoped > 0) next.scoped = { ...plan.scoped, weekly: q.scoped }
  return next
}

export function QuotaPanel({ files, settings, onSettings, now }: Props): React.JSX.Element {
  const log = useQuotaLog()
  const at = now ?? Date.now()
  const q = settings.quota

  const base = QUOTA_BASE(q)
  const { plan, view, measured, calibratedFrom } = React.useMemo(() => {
    const useMeasured = q?.useMeasured !== false
    let p = base
    let from = 0
    if (useMeasured && log.samples.length > 0) {
      const cal = calibrate({
        spend: meteredSpend(files, base, settings.pricing),
        samples: log.samples,
        weekMs: WEEK_MS
      })
      from = cal.points.session.length + cal.points.weekly.length
      if (from > 0) p = calibratedPlan(base, cal)
    }
    p = withOverrides(p, q)
    return {
      plan: p,
      view: buildQuota(files, p, at, settings.pricing, from > 0),
      measured: latestSample(log.samples, at),
      calibratedFrom: from
    }
  }, [files, base, q, settings.pricing, log.samples, at])

  return (
    <Panel
      title="Rate limits"
      subtitle="what your subscription actually meters"
      action={<LogControl log={log} />}
    >
      <MeteredHeadline view={view} />
      <CoverageNote view={view} measured={measured} />
      <WeekBar view={view} measured={measured} />
      <SessionSummary view={view} />
      <PlanControls
        plan={plan}
        settings={settings}
        onSettings={onSettings}
        calibratedFrom={calibratedFrom}
        hasLog={log.samples.length > 0}
      />
    </Panel>
  )
}

function QUOTA_BASE(q: QuotaSettings | undefined): QuotaPlan {
  return (q?.planId && QUOTA_PLAN_BY_ID[q.planId]) || MAX_20X
}
const QUOTA_PLAN_BY_ID: Record<string, QuotaPlan> = { [MAX_20X.id]: MAX_20X }

// ---------------------------------------------------------------------------

function MeteredHeadline({ view }: { view: QuotaView }): React.JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <span className="text-sm">
        <span className="font-serif text-xl text-text">{formatCost(view.metered)}</span>{' '}
        <span className="text-muted-foreground">counted against your limits</span>
      </span>
      <span className="text-sm text-muted-foreground">
        of {formatCost(view.apiCost)} API-equivalent -{' '}
        <span className="text-text">{Math.round(view.freeShare * 100)}% is cache reads</span>, which
        are free to the meter
        <InfoDot text="Only fresh input, output and cache writes consume your rate limit. Cache reads do not. That is why quota burn feels unpredictable: two sessions with identical total tokens can cost wildly different amounts of limit." />
      </span>
    </div>
  )
}

/** Percentage that never reads as a flat 0 for a small non-zero value. */
function pct(v: number): string {
  if (v > 0 && v < 0.01) return '<1%'
  return `${Math.round(v * 100)}%`
}

/**
 * When a measured reading is available, the gap between it and our estimate is
 * itself a finding: it means claudepad is not seeing all the usage the meter
 * counted - dropped-in files rather than a connected vault, pruned transcripts,
 * or work done on another machine. Better to say so than to quietly show a
 * number that is too low.
 */
function CoverageNote({ view, measured }: { view: QuotaView; measured?: QuotaSample }): React.JSX.Element | null {
  const est = view.forecast?.window.utilization
  if (measured?.weekly === undefined || est === undefined) return null
  const gap = measured.weekly / 100 - est
  if (gap < 0.15) return null
  return (
    <p className="mb-3 rounded-md border border-border bg-accent-tint p-2 text-xs text-muted-foreground">
      Your account reports <span className="text-text">{Math.round(measured.weekly)}%</span> used this
      week but the loaded sessions only account for{' '}
      <span className="text-text">{pct(est)}</span>. claudepad is missing some of the usage the meter
      counted - connect your <code>~/.claude</code> folder for the full picture, or the rest happened on
      another machine.
    </p>
  )
}

function Meter({
  label,
  value,
  caption,
  danger
}: {
  label: React.ReactNode
  value: number
  caption?: React.ReactNode
  danger?: boolean
}): React.JSX.Element {
  const filled = Math.max(0, Math.min(1, value))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${danger ? 'text-danger' : 'text-text'}`}>{pct(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full ${danger ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${filled * 100}%` }}
        />
      </div>
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </div>
  )
}

function WeekBar({ view, measured }: { view: QuotaView; measured?: QuotaSample }): React.JSX.Element {
  const f = view.forecast
  if (!f) return <Empty>No activity in the current week.</Empty>
  const w = f.window
  const over = f.projected >= 1
  const scopedOver = (f.projectedScoped ?? 0) >= 1
  return (
    <div className="flex flex-col gap-3">
      <Meter
        label={
          <>
            This week{' '}
            <span className="text-text">
              {formatCost(w.metered)} / {formatCost(view.plan.weekly)}
            </span>
            {measured?.weekly !== undefined && (
              <span className="ml-1.5 text-accent">measured {Math.round(measured.weekly)}%</span>
            )}
          </>
        }
        value={w.utilization}
        danger={w.utilization >= 1}
        caption={`${Math.round(f.elapsed * 100)}% of the week elapsed · ${formatCost(f.burnPerDay)}/day`}
      />
      {view.plan.scoped && (
        <Meter
          label={
            <>
              {view.plan.scoped.label} weekly{' '}
              <span className="text-text">
                {formatCost(w.scoped)} / {formatCost(view.plan.scoped.weekly)}
              </span>
              {measured?.scoped !== undefined && (
                <span className="ml-1.5 text-accent">measured {Math.round(measured.scoped)}%</span>
              )}
            </>
          }
          value={w.scopedUtilization ?? 0}
          danger={(w.scopedUtilization ?? 0) >= 1}
        />
      )}
      {(over || scopedOver) && (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
          <span>
            At {formatCost(f.burnPerDay)}/day you reach{' '}
            <span className="tabular-nums">
              {Math.round((f.bindingLimit === 'scoped' ? (f.projectedScoped ?? 0) : f.projected) * 100)}%
            </span>{' '}
            of your {f.bindingLimit === 'scoped' ? view.plan.scoped?.label : 'weekly'} limit before it
            resets
            {f.exhaustsAt !== undefined && (
              <> - running out around {new Date(f.exhaustsAt).toLocaleString()}</>
            )}
            .
          </span>
        </div>
      )}
    </div>
  )
}

function SessionSummary({ view }: { view: QuotaView }): React.JSX.Element {
  const recent = view.sessions.slice(-24)
  const max = Math.max(1, ...recent.map((w) => w.utilization))
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>
          5-hour windows{' '}
          <InfoDot
            text={`Each bar is one 5-hour session window (budget ${formatCost(view.plan.session)}). A window opens on your first turn after the previous one closed and runs five hours.`}
          />
        </span>
        <span>
          {view.sessionsMaxed > 0 && `${formatCount(view.sessionsMaxed)} hit the limit · `}
          peak {pct(view.peakSession)}
        </span>
      </div>
      {recent.length === 0 ? (
        <Empty>No session windows yet.</Empty>
      ) : (
        // Capped bar width so a handful of windows reads as a few bars rather
        // than stretching into a meaningless full-width rule.
        <div className="flex h-12 items-end gap-[3px]">
          {recent.map((w) => {
            const full = w.utilization >= 1
            return (
              <div
                key={w.start}
                className={'h-full min-w-0 max-w-[18px] flex-1 flex items-end'}
                title={`${new Date(w.start).toLocaleString()} - ${formatCost(w.metered)} (${pct(w.utilization)})`}
              >
                <div
                  className={`w-full rounded-[2px] ${full ? 'bg-danger' : 'bg-accent'}`}
                  style={{ height: `${Math.max(6, (w.utilization / max) * 100)}%`, opacity: full ? 1 : 0.75 }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlanControls({
  plan,
  settings,
  onSettings,
  calibratedFrom,
  hasLog
}: {
  plan: QuotaPlan
  settings: UsageSettings
  onSettings: (patch: Partial<UsageSettings>) => void
  calibratedFrom: number
  hasLog: boolean
}): React.JSX.Element {
  const q = settings.quota ?? {}
  const patch = (p: Partial<QuotaSettings>) => onSettings({ quota: { ...q, ...p } })
  const field = (key: 'session' | 'weekly' | 'scoped', label: string, value: number) => (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <span className="text-muted-foreground">$</span>
      <input
        type="number"
        min={0}
        className="w-16 rounded-md border border-border bg-surface px-1.5 py-0.5 text-right text-text"
        value={q[key] ?? Math.round(value)}
        onChange={(e) => patch({ [key]: Math.max(0, Number(e.target.value) || 0) })}
      />
    </label>
  )
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {field('session', '5h budget', plan.session)}
        {field('weekly', 'weekly', plan.weekly)}
        {plan.scoped && field('scoped', plan.scoped.label, plan.scoped.weekly)}
        {hasLog && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={q.useMeasured !== false}
              onChange={(e) => patch({ useMeasured: e.target.checked })}
            />
            use measured
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {calibratedFrom > 0
          ? `Budgets measured from ${calibratedFrom} windows in your own quota log.`
          : plan.provenance}
      </p>
    </div>
  )
}

function LogControl({ log }: { log: ReturnType<typeof useQuotaLog> }): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null)
  if (log.status === 'needs-permission') {
    return (
      <Button variant="secondary" size="sm" onClick={() => void log.regrant()}>
        Reconnect quota log
      </Button>
    )
  }
  if (log.samples.length > 0) {
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {formatCount(log.samples.length)} readings{log.connected ? '' : ' (imported)'}
        <button type="button" className="underline hover:text-text" onClick={() => void log.disconnect()}>
          clear
        </button>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      {isFolderPickerSupported() && (
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void log.connect()}>
          <FolderOpen className="size-3.5" />
          Connect quota log
        </Button>
      )}
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
        <Upload className="size-3.5" />
        Import
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jsonl"
        className="sr-only"
        data-testid="quota-log-input"
        onChange={(e) => {
          void log.importFiles(e.target.files ?? [])
          e.target.value = ''
        }}
      />
    </span>
  )
}

// --- local chrome (mirrors the dashboard's, kept private to this panel) -----

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
            <Info className="inline size-3" />
          </button>
        }
      />
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  )
}
