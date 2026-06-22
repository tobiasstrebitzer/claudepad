import type { AssistantEvent } from '@/schema'
import * as React from 'react'
import { Badge } from '../../../components/ui/Badge'
import { ContentBlocks } from '../blocks/ContentBlocks'
import { TurnShell } from './TurnShell'

export const AssistantTurn = React.memo(({
  event,
  anchorId,
  highlighted,
  typingFraction
}: {
  event: AssistantEvent
  anchorId: string
  highlighted?: boolean
  typingFraction?: number
}) => {
  return (
    <TurnShell
      anchorId={anchorId}
      ts={event.ts}
      variant="assistant"
      roleLabel="Assistant"
      highlighted={highlighted}
      headerExtra={
        event.model ? (
          <Badge variant="outline" className="bg-sidebar font-mono normal-case text-muted-foreground">
            {event.model}
          </Badge>
        ) : undefined
      }
    >
      <ContentBlocks blocks={event.content} typingFraction={typingFraction} />
    </TurnShell>
  )
})
