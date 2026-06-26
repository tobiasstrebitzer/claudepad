// Date-range control for Usage Insights (PRD-13 FR-17): a shadcn-style popover
// over a range calendar, plus quick presets. Emits inclusive `YYYY-MM-DD` day
// bounds so the dashboard computes exact usage down to the day.

import { CalendarDays } from 'lucide-react'
import * as React from 'react'
import type { DateRange, Matcher } from 'react-day-picker'
import { Button } from '../components/ui/Button'
import { Calendar } from '../components/ui/Calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover'

export interface DayRangeValue {
  fromDay?: string
  toDay?: string
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDay(s?: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

function label(value: DayRangeValue): string {
  const fmt = (s: string) => parseDay(s)!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (value.fromDay && value.toDay) return `${fmt(value.fromDay)} - ${fmt(value.toDay)}`
  if (value.fromDay) return `from ${fmt(value.fromDay)}`
  if (value.toDay) return `until ${fmt(value.toDay)}`
  return 'All time'
}

export function DateRangeControl({
  value,
  onChange,
  minDay,
  maxDay
}: {
  value: DayRangeValue
  onChange: (v: DayRangeValue) => void
  minDay?: string
  maxDay?: string
}): React.JSX.Element {
  const selected: DateRange | undefined =
    value.fromDay || value.toDay
      ? { from: parseDay(value.fromDay), to: parseDay(value.toDay) }
      : undefined

  // Presets anchored to the latest day of data, so they're meaningful even if
  // the vault is older than "today".
  const anchor = parseDay(maxDay) ?? new Date()
  const back = (days: number): DayRangeValue => {
    const from = new Date(anchor)
    from.setDate(from.getDate() - (days - 1))
    return { fromDay: dayKey(from), toDay: dayKey(anchor) }
  }
  const thisMonth = (): DayRangeValue => ({
    fromDay: dayKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
    toDay: dayKey(anchor)
  })

  const minD = parseDay(minDay)
  const maxD = parseDay(maxDay)
  const disabled: Matcher[] = []
  if (minD) disabled.push({ before: minD })
  if (maxD) disabled.push({ after: maxD })

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" className="gap-1.5">
            <CalendarDays className="size-4" />
            {label(value)}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          <Preset text="All time" onClick={() => onChange({})} active={!value.fromDay && !value.toDay} />
          <Preset text="7 days" onClick={() => onChange(back(7))} />
          <Preset text="30 days" onClick={() => onChange(back(30))} />
          <Preset text="This month" onClick={() => onChange(thisMonth())} />
        </div>
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={selected?.from ?? anchor}
          selected={selected}
          onSelect={(range) =>
            onChange({
              ...(range?.from ? { fromDay: dayKey(range.from) } : {}),
              ...(range?.to ? { toDay: dayKey(range.to) } : {})
            })
          }
          startMonth={minD}
          endMonth={maxD}
          disabled={disabled.length ? disabled : undefined}
        />
      </PopoverContent>
    </Popover>
  )
}

function Preset({ text, onClick, active }: { text: string; onClick: () => void; active?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent-tint ${active ? 'bg-accent-tint text-text' : 'text-muted-foreground'}`}
    >
      {text}
    </button>
  )
}
