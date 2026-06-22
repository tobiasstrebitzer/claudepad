import type { ContentBlock, ThinkingEvent } from '@/schema'
import { Brain, ChevronRight } from 'lucide-react'
import * as React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../../components/ui/Collapsible'
import { cn } from '../../../lib/cn'
import { wordCount } from '../../format'
import { useCollapsibleState } from '../../hooks/useExpand'
import { ContentBlocks } from '../blocks/ContentBlocks'

export const ThinkingBlock = React.memo(({
  event,
  anchorId
}: {
  event: ThinkingEvent
  anchorId: string
}) => {
  const [open, setOpen] = useCollapsibleState('thinking', false)

  if (event.redacted) {
    return (
      <div
        id={anchorId}
        data-anchor-id={anchorId}
        className="my-1.5 flex items-center gap-2 rounded-md border border-dashed border-border bg-sidebar px-3 py-2 text-body-sm text-muted-foreground"
      >
        <Brain className="size-3.5 shrink-0" />
        <span>Thinking redacted</span>
      </div>
    )
  }

  const words = textOf(event.content)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      id={anchorId}
      data-anchor-id={anchorId}
      className="my-1.5 rounded-md border border-border bg-sidebar"
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
        <Brain className="size-3.5 shrink-0 text-accent" />
        <span>Thinking</span>
        <span className="text-muted-foreground">({words.toLocaleString()} words)</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 text-body-sm text-muted-foreground">
          {/* Bodies are NOT rendered until expanded (perf). */}
          {open && <ContentBlocks blocks={event.content} />}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

function textOf(blocks: ContentBlock[]): number {
  return wordCount(
    blocks.map((b) => (b.type === 'text' || b.type === 'code' ? b.text : '')).join(' ')
  )
}
