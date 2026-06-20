import { Sparkles, Braces } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ViewMode = 'pretty' | 'raw';

const OPTIONS: { value: ViewMode; label: string; Icon: typeof Sparkles }[] = [
  { value: 'pretty', label: 'Pretty', Icon: Sparkles },
  { value: 'raw', label: 'Raw', Icon: Braces },
];

/** Segmented pretty/raw toggle for the session view (top-bar, line 2). */
export function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex shrink-0 items-center rounded-md border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-label transition-colors',
              active ? 'bg-accent-tint font-medium text-text' : 'text-muted hover:text-text',
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
