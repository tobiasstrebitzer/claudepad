import * as React from 'react';
import type { UserEvent } from '@claudepad/schema';
import { TurnShell } from './TurnShell';
import { ContentBlocks } from '../blocks/ContentBlocks';

export const UserTurn = React.memo(function UserTurn({
  event,
  anchorId,
  highlighted,
}: {
  event: UserEvent;
  anchorId: string;
  highlighted?: boolean;
}) {
  return (
    <TurnShell
      anchorId={anchorId}
      ts={event.ts}
      variant="user"
      roleLabel="User"
      highlighted={highlighted}
    >
      <ContentBlocks blocks={event.content} />
    </TurnShell>
  );
});
