import { Clock } from 'lucide-react';

function humanize(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** A subtle "N later" marker for a long real-time gap between turns. */
export function IdleDivider({ gapMs }: { gapMs: number }) {
  return (
    <div className="my-1 flex items-center gap-3 text-label text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3" />
        {humanize(gapMs)} later
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
