import type { ToolResultEvent } from '@claudepad/schema'
import { ChevronRight, CircleAlert, CircleCheck, CornerDownRight } from 'lucide-react'
import * as React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../../components/ui/Collapsible'
import { cn } from '../../../lib/cn'
import { sizeIndicator, stringifyValue } from '../../format'
import { useCollapsibleState } from '../../hooks/useExpand'
import { SecretText } from '../blocks/SecretText'

/**
 * Tool result. Correlated results render nested under their tool_use;
 * `standalone` results render with their own frame. Error results are
 * danger-tinted and auto-expanded (FR-10). Large output collapsed by default
 * with a size indicator (FR-11).
 */
export const ToolResult = React.memo(({
  event,
  standalone,
  anchorId
}: {
  event: ToolResultEvent
  standalone?: boolean
  anchorId?: string
}) => {
  const text = React.useMemo(() => stringifyValue(event.output), [event.output])
  const isError = event.isError === true
  // Error => auto-expanded; otherwise collapsed by default.
  const [open, setOpen] = useCollapsibleState('toolIO', isError)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      id={anchorId}
      data-anchor-id={anchorId}
      className={cn(
        'mt-1.5 rounded-md border',
        isError ? 'border-danger/40 bg-danger/5' : 'border-border bg-bg',
        standalone && 'my-2'
      )}
    >
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-body-sm',
          isError ? 'text-danger' : 'text-muted-foreground hover:text-text'
        )}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-[120ms]',
            open && 'rotate-90'
          )}
        />
        {!standalone && <CornerDownRight className="size-3.5 shrink-0" />}
        {isError ? (
          <CircleAlert className="size-3.5 shrink-0 text-danger" />
        ) : (
          <CircleCheck className="size-3.5 shrink-0 text-success" />
        )}
        <span className="font-medium">
          {isError ? 'error' : 'result'}
          {standalone && event.forName ? ` · ${event.forName}` : ''}
        </span>
        <span className="ml-auto font-mono text-label text-muted-foreground">
          {sizeIndicator(text)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          className={cn(
            'max-h-96 overflow-auto px-3 pb-2.5 pt-1 font-mono text-code',
            isError ? 'text-danger' : 'text-text'
          )}
        >
          <code>{open ? <SecretText>{text}</SecretText> : null}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
})
