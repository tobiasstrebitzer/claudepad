import type { UserEvent } from '@/schema'
import * as React from 'react'
import { ContentBlocks } from '../blocks/ContentBlocks'
import { TurnShell } from './TurnShell'

export const UserTurn = React.memo(({
  event,
  anchorId,
  highlighted,
  typingFraction
}: {
  event: UserEvent
  anchorId: string
  highlighted?: boolean
  typingFraction?: number
}) => {
  return (
    <TurnShell
      anchorId={anchorId}
      ts={event.ts}
      variant="user"
      roleLabel="User"
      highlighted={highlighted}
    >
      <ContentBlocks blocks={event.content} typingFraction={typingFraction} />
    </TurnShell>
  )
})
