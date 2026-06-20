import * as React from 'react';
import { BlockErrorBoundary } from '../BlockErrorBoundary';
import type { RenderRow } from '../../hooks/useCorrelateTools';
import { anchorIdFor } from '../../hooks/useAnchor';
import { UserTurn } from './UserTurn';
import { AssistantTurn } from './AssistantTurn';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCall } from './ToolCall';
import { ToolResult } from './ToolResult';
import { MetaBlock } from './MetaBlock';

/** Render one top-level transcript row, error-isolated (FR-7). */
export const TurnRenderer = React.memo(function TurnRenderer({
  row,
  highlightId,
}: {
  row: RenderRow;
  highlightId?: string;
}) {
  return (
    <BlockErrorBoundary fallbackValue={row.event}>
      <Row row={row} highlightId={highlightId} />
    </BlockErrorBoundary>
  );
});

function Row({ row, highlightId }: { row: RenderRow; highlightId?: string }) {
  const anchorId = anchorIdFor(row.event, row.index);
  const highlighted = highlightId === anchorId;

  if (row.kind === 'tool') {
    return (
      <ToolCall
        event={row.event}
        result={row.result}
        anchorId={anchorId}
        highlighted={highlighted}
      />
    );
  }
  if (row.kind === 'orphan-result') {
    return <ToolResult event={row.event} standalone anchorId={anchorId} />;
  }

  const event = row.event;
  switch (event.kind) {
    case 'user':
      return <UserTurn event={event} anchorId={anchorId} highlighted={highlighted} />;
    case 'assistant':
      return (
        <AssistantTurn event={event} anchorId={anchorId} highlighted={highlighted} />
      );
    case 'thinking':
      return <ThinkingBlock event={event} anchorId={anchorId} />;
    case 'meta':
      return <MetaBlock event={event} anchorId={anchorId} />;
    default:
      return null;
  }
}
