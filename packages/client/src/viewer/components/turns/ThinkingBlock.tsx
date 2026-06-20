import * as React from 'react';
import { ChevronRight, Brain } from 'lucide-react';
import type { ThinkingEvent, ContentBlock } from '@claudepad/schema';
import { cn } from '../../../lib/cn';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '../../../components/ui/collapsible';
import { ContentBlocks } from '../blocks/ContentBlocks';
import { useCollapsibleState } from '../../hooks/useExpand';
import { wordCount } from '../../format';

export const ThinkingBlock = React.memo(function ThinkingBlock({
  event,
  anchorId,
}: {
  event: ThinkingEvent;
  anchorId: string;
}) {
  const [open, setOpen] = useCollapsibleState('thinking', false);

  if (event.redacted) {
    return (
      <div
        id={anchorId}
        data-anchor-id={anchorId}
        className="my-1.5 flex items-center gap-2 rounded-md border border-dashed border-border bg-sidebar px-3 py-2 text-body-sm text-muted"
      >
        <Brain className="size-3.5 shrink-0" />
        <span>Thinking redacted</span>
      </div>
    );
  }

  const words = textOf(event.content);

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
          'flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-muted',
          'hover:text-text',
        )}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-[120ms]',
            open && 'rotate-90',
          )}
        />
        <Brain className="size-3.5 shrink-0 text-accent" />
        <span>Thinking</span>
        <span className="text-muted">({words.toLocaleString()} words)</span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="px-3 pb-3 text-body-sm text-muted">
          {/* Bodies are NOT rendered until expanded (perf). */}
          {open && <ContentBlocks blocks={event.content} />}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
});

function textOf(blocks: ContentBlock[]): number {
  return wordCount(
    blocks.map((b) => (b.type === 'text' || b.type === 'code' ? b.text : '')).join(' '),
  );
}
