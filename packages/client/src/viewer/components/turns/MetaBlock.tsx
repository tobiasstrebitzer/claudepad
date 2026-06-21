import * as React from 'react';
import { Info } from 'lucide-react';
import type { MetaEvent } from '@claudepad/schema';
import { RawBlock } from '../blocks/RawBlock';
import { attachmentType } from '../../hooks/eventVisibility';

/**
 * Graceful fallback for `meta` / unrecognized events (FR-7). Shows the note and
 * offers the raw payload; never crashes.
 */
export const MetaBlock = React.memo(function MetaBlock({
  event,
  anchorId,
}: {
  event: MetaEvent;
  anchorId: string;
}) {
  return (
    <div
      id={anchorId}
      data-anchor-id={anchorId}
      role="note"
      aria-label="Session note"
      className="my-1.5"
    >
      <div className="mb-1 flex items-center gap-2 text-body-sm text-muted">
        <Info className="size-3.5 shrink-0" />
        <span>{attachmentType(event) || event.note || event.subtype || 'Note'}</span>
      </div>
      {event.raw != null && <RawBlock value={event.raw} label="Raw event" />}
    </div>
  );
});
