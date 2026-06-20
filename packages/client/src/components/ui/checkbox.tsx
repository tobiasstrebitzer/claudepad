import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

// Checkbox (FR-11/FR-12) on Base UI. Accent fill + check icon when checked.
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof BaseCheckbox.Root>) {
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-surface',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
        'hover:border-muted/60',
        'data-[checked]:border-transparent data-[checked]:bg-accent data-[checked]:text-accent-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex data-[unchecked]:hidden">
        <Check className="size-3.5" strokeWidth={3} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
