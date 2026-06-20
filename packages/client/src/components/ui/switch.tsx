import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../../lib/cn';

// Switch (FR-11/FR-12) on Base UI. Accent fill when checked; token-driven states.
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-sidebar p-0.5',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
        'data-[checked]:border-transparent data-[checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          'block size-4 rounded-full bg-surface shadow-[var(--shadow-sm)]',
          'transition-transform duration-[120ms] ease-[var(--ease-standard)]',
          'data-[checked]:translate-x-4 data-[checked]:bg-[var(--accent-fg)]',
        )}
      />
    </BaseSwitch.Root>
  );
}
