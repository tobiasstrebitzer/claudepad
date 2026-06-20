import { Separator as BaseSeparator } from '@base-ui-components/react/separator';
import { cn } from '../../lib/cn';

// Separator (FR-11) on Base UI — hairline, the favored divider over shadows.
export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
