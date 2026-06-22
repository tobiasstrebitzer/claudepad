import { SlidersHorizontal } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../../components/ui/Popover'
import { DEFAULT_VISIBILITY, EVENT_GROUPS } from '../hooks/eventFilter'
import { useEventFilter } from '../hooks/useEventFilter'

/**
 * Top-bar control to toggle which event groups appear in the transcript. Choices
 * persist and are honored by playback too (filtered events are ignored entirely).
 */
export function EventFilterControl() {
  const { visibility, setGroup, reset } = useEventFilter()
  const hiddenCount = EVENT_GROUPS.filter((g) => !visibility[g.key]).length

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Filter events">
            <SlidersHorizontal className="size-4" />
            Filter
            {hiddenCount > 0 && (
              <span className="ml-0.5 rounded-full bg-accent-tint px-1.5 text-label text-accent tabular-nums">
                {hiddenCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" side="bottom" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-label uppercase tracking-[0.02em] text-muted-foreground">Show events</span>
          <button
            type="button"
            onClick={reset}
            className="text-label text-muted-foreground hover:text-accent"
          >
            Reset
          </button>
        </div>
        <ul>
          {EVENT_GROUPS.map((g) => {
            const id = `evt-filter-${g.key}`
            return (
              <li key={g.key}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-sidebar"
                >
                  <Checkbox
                    id={id}
                    checked={visibility[g.key]}
                    onCheckedChange={(on) => setGroup(g.key, on === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-body-sm text-text">{g.label}</span>
                    <span className="block text-label text-muted-foreground">{g.hint}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        {visibility.system === DEFAULT_VISIBILITY.system && (
          <p className="px-1 pt-1 text-label text-muted-foreground">System events are hidden by default.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
