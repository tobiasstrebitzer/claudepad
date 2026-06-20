import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible';
import { cn } from '../../lib/cn';

// Collapsible (FR-11) on Base UI. Panel animates height via the exposed CSS vars.
export function Collapsible(props: React.ComponentProps<typeof BaseCollapsible.Root>) {
  return <BaseCollapsible.Root data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger(
  props: React.ComponentProps<typeof BaseCollapsible.Trigger>,
) {
  return <BaseCollapsible.Trigger data-slot="collapsible-trigger" {...props} />;
}

export function CollapsiblePanel({
  className,
  ...props
}: React.ComponentProps<typeof BaseCollapsible.Panel>) {
  return (
    <BaseCollapsible.Panel
      data-slot="collapsible-panel"
      className={cn(
        'overflow-hidden text-body text-text',
        'h-[var(--collapsible-panel-height)]',
        'transition-[height] duration-[150ms] ease-[var(--ease-standard)]',
        'data-[starting-style]:h-0 data-[ending-style]:h-0',
        className,
      )}
      {...props}
    />
  );
}
