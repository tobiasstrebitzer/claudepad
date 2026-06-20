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
  typingFraction,
}: {
  row: RenderRow;
  highlightId?: string;
  /** PRD-08 typing reveal - only set for the active playback turn. */
  typingFraction?: number;
}) {
  return (
    <BlockErrorBoundary fallbackValue={row.event}>
      <Row row={row} highlightId={highlightId} typingFraction={typingFraction} />
    </BlockErrorBoundary>
  );
});

function Row({
  row,
  highlightId,
  typingFraction,
}: {
  row: RenderRow;
  highlightId?: string;
  typingFraction?: number;
}) {
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
      return (
        <UserTurn
          event={event}
          anchorId={anchorId}
          highlighted={highlighted}
          typingFraction={typingFraction}
        />
      );
    case 'assistant':
      return (
        <AssistantTurn
          event={event}
          anchorId={anchorId}
          highlighted={highlighted}
          typingFraction={typingFraction}
        />
      );
    case 'thinking':
      return <ThinkingBlock event={event} anchorId={anchorId} />;
    case 'meta':
      return <MetaBlock event={event} anchorId={anchorId} />;
    default:
      return null;
  }
}
