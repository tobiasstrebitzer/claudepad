import type { ToolResultEvent, ToolUseEvent } from '@/schema'
import { ChevronRight, Wrench } from 'lucide-react'
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
import { ToolResult } from './ToolResult'

/**
 * Tool call: name always visible + a one-line summary derived from input; the
 * full input is collapsible (FR-8). A correlated result renders nested
 * underneath (FR-9). Pure function of props.
 */
export const ToolCall = React.memo(({
  event,
  result,
  anchorId,
  highlighted
}: {
  event: ToolUseEvent
  result?: ToolResultEvent
  anchorId: string
  highlighted?: boolean
}) => {
  const inputText = React.useMemo(() => stringifyValue(event.input), [event.input])
  const summary = React.useMemo(() => summarizeInput(event.input), [event.input])
  const [open, setOpen] = useCollapsibleState('toolIO', false)

  return (
    <section
      id={anchorId}
      data-anchor-id={anchorId}
      role="article"
      aria-label={`Tool call ${event.name}`}
      className={cn(
        'group/turn relative scroll-mt-24 rounded-lg border border-border bg-bg px-3 py-2.5',
        highlighted && 'ring-2 ring-accent'
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-center gap-2 text-left text-body-sm text-text',
            'hover:text-accent'
          )}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-[120ms]',
              open && 'rotate-90'
            )}
          />
          <Wrench className="size-3.5 shrink-0 text-accent" />
          <span className="font-medium">{event.name}</span>
          {summary && (
            <span className="truncate font-mono text-code text-muted-foreground">{summary}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-label text-muted-foreground">
            {sizeIndicator(inputText)}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1.5">
            <p className="mb-1 text-label uppercase tracking-[0.02em] text-muted-foreground">
              input
            </p>
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-sidebar px-3 py-2 font-mono text-code text-text">
              <code>{open ? <SecretText>{inputText}</SecretText> : null}</code>
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {result && <ToolResult event={result} />}
    </section>
  )
})

/** One-line summary from common tool input shapes (command / file path). */
export function summarizeInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return truncate(input)
  if (typeof input !== 'object') return truncate(String(input))
  const obj = input as Record<string, unknown>
  const command = pickString(obj, ['command', 'cmd', 'script'])
  if (command) return truncate(command)
  const path = pickString(obj, ['file_path', 'filePath', 'path', 'notebook_path'])
  if (path) {
    // Read with an explicit window → show the line range too.
    const offset = obj['offset']
    const limit = obj['limit']
    if (typeof offset === 'number' && typeof limit === 'number') {
      return truncate(`${path} (lines ${offset}-${offset + limit})`)
    }
    return truncate(path)
  }
  const query = pickString(obj, ['query', 'pattern', 'url', 'prompt'])
  if (query) return truncate(query)
  const keys = Object.keys(obj)
  if (keys.length === 0) return ''
  return truncate(keys.slice(0, 3).join(', '))
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

function truncate(s: string, max = 80): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}
