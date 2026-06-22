import { ChevronRight, Layers } from 'lucide-react'
import * as React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../../components/ui/Collapsible'
import { cn } from '../../../lib/cn'
import { toolRunLabel } from '../../hooks/groupRows'
import { anchorIdFor } from '../../hooks/useAnchor'
import type { RenderRow } from '../../hooks/useCorrelateTools'
import { TurnRenderer } from './TurnRenderer'

/**
 * A folded run of consecutive same-name tool calls ("Read ×6"). Collapsed by
 * default to declutter the transcript; expands to the individual calls (rendered
 * through the same registry). Auto-expands when it contains a deep-link target so
 * the anchor is reachable.
 */
export const ToolRunGroup = React.memo(({
  rows,
  highlightId
}: {
  rows: RenderRow[]
  highlightId?: string
}) => {
  const containsTarget = React.useMemo(
    () => !!highlightId && rows.some((r) => anchorIdFor(r.event, r.index) === highlightId),
    [highlightId, rows]
  )
  const [open, setOpen] = React.useState(false)
  const expanded = open || containsTarget
  const { name, count } = toolRunLabel(rows)

  return (
    <section
      role="group"
      aria-label={name ? `${count} ${name} calls` : `${count} tool calls`}
      className="rounded-lg border border-border bg-bg"
    >
      <Collapsible open={expanded} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-muted-foreground hover:text-text">
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-[120ms]',
              expanded && 'rotate-90'
            )}
          />
          <Layers className="size-3.5 shrink-0 text-accent" />
          {name ? (
            <>
              <span className="font-medium text-text">{name}</span>
              <span className="text-muted-foreground">{`×${count}`}</span>
            </>
          ) : (
            <span className="font-medium text-text">{`${count} tool calls`}</span>
          )}
          <span className="ml-auto text-label uppercase tracking-[0.02em] text-muted-foreground">
            {expanded ? 'collapse' : 'expand'}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 px-3 pb-3 pt-1">
            {rows.map((r) => (
              <TurnRenderer key={r.index} row={r} highlightId={highlightId} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
})
