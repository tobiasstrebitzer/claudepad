import { ScrollArea as BaseScrollArea } from '@base-ui-components/react/scroll-area';
import { cn } from '../../lib/cn';

// ScrollArea (FR-11) on Base UI. Subtle thumb using bg-border.
export function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseScrollArea.Root>) {
  return (
    <BaseScrollArea.Root
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <BaseScrollArea.Viewport className="size-full overscroll-contain rounded-[inherit]">
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        orientation="vertical"
        className={cn(
          'flex w-2 touch-none select-none p-0.5',
          'transition-opacity duration-[150ms] ease-[var(--ease-standard)]',
          'data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
        )}
      >
        <BaseScrollArea.Thumb className="w-full rounded-full bg-border" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Scrollbar
        orientation="horizontal"
        className={cn(
          'flex h-2 touch-none select-none p-0.5',
          'transition-opacity duration-[150ms] ease-[var(--ease-standard)]',
          'data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
        )}
      >
        <BaseScrollArea.Thumb className="h-full rounded-full bg-border" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  );
}
