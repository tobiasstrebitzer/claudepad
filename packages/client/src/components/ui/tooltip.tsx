import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import { cn } from '../../lib/cn';

// Tooltip (FR-11) on Base UI. Surface popup, hairline border, soft shadow.
export function TooltipProvider(
  props: React.ComponentProps<typeof BaseTooltip.Provider>,
) {
  return <BaseTooltip.Provider delay={300} {...props} />;
}

export function Tooltip(props: React.ComponentProps<typeof BaseTooltip.Root>) {
  return <BaseTooltip.Root {...props} />;
}

export function TooltipTrigger(props: React.ComponentProps<typeof BaseTooltip.Trigger>) {
  return <BaseTooltip.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Popup> & { sideOffset?: number }) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset}>
        <BaseTooltip.Popup
          data-slot="tooltip-content"
          className={cn(
            'max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-body-sm text-text',
            'shadow-[var(--shadow-md)]',
            'origin-[var(--transform-origin)]',
            'transition-[opacity,transform] duration-[150ms] ease-[var(--ease-standard)]',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
