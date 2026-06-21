import * as React from 'react';
import { BlockErrorBoundary } from '../BlockErrorBoundary';
import type { RenderRow } from '../../hooks/useCorrelateTools';
import { anchorIdFor } from '../../hooks/useAnchor';
import { matchTurn } from './registry';

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
  return <>{matchTurn(row).render(row, { anchorId, highlighted, typingFraction })}</>;
}
