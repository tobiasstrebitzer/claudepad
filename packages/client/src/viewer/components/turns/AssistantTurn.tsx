import * as React from 'react';
import type { AssistantEvent } from '@claudepad/schema';
import { Badge } from '../../../components/ui/badge';
import { TurnShell } from './TurnShell';
import { ContentBlocks } from '../blocks/ContentBlocks';

export const AssistantTurn = React.memo(function AssistantTurn({
  event,
  anchorId,
  highlighted,
}: {
  event: AssistantEvent;
  anchorId: string;
  highlighted?: boolean;
}) {
  return (
    <TurnShell
      anchorId={anchorId}
      ts={event.ts}
      variant="assistant"
      roleLabel="Assistant"
      highlighted={highlighted}
      headerExtra={
        event.model ? (
          <Badge variant="neutral" className="font-mono normal-case">
            {event.model}
          </Badge>
        ) : undefined
      }
    >
      <ContentBlocks blocks={event.content} />
    </TurnShell>
  );
});
