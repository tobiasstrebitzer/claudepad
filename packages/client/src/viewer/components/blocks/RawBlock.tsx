import * as React from 'react'
import { ChevronRight, FileQuestion } from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
} from '../../../components/ui/Collapsible'

/**
 * Graceful fallback for `raw` / unrecognized content (FR-7). Collapsed by
 * default; expands to show the original JSON. Never crashes the transcript.
 */
export function RawBlock({
  value,
  label = 'Unrecognized content'
}: {
  value: unknown
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  const json = React.useMemo(() => safeStringify(value), [value])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="my-2 rounded-md border border-dashed border-border bg-sidebar"
    >
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-muted-foreground',
          'hover:text-text'
        )}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-[120ms]',
            open && 'rotate-90'
          )}
        />
        <FileQuestion className="size-3.5 shrink-0" />
        <span>{label} - show raw JSON</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-code text-text">
          <code>{json}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
