import { Popover as BasePopover } from '@base-ui-components/react/popover';
import { cn } from '../../lib/cn';

// Popover (FR-11) on Base UI. Surface popup, radius-lg, hairline border, soft shadow.
export function Popover(props: React.ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root {...props} />;
}

export function PopoverTrigger(props: React.ComponentProps<typeof BasePopover.Trigger>) {
  return <BasePopover.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  children,
  sideOffset = 6,
  side,
  align,
  ...props
}: React.ComponentProps<typeof BasePopover.Popup> & {
  sideOffset?: number;
  side?: React.ComponentProps<typeof BasePopover.Positioner>['side'];
  align?: React.ComponentProps<typeof BasePopover.Positioner>['align'];
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={sideOffset} side={side} align={align}>
        <BasePopover.Popup
          data-slot="popover-content"
          className={cn(
            'min-w-[12rem] rounded-lg border border-border bg-surface p-4 text-body text-text',
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
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export const PopoverClose = BasePopover.Close;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;
