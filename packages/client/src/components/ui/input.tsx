import * as React from 'react';
import { cn } from '../../lib/cn';

// Input (FR-11/FR-12). Hairline border, accent focus ring from globals.
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full rounded-sm border border-border bg-surface px-3 text-body text-text',
        'placeholder:text-muted',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
        'hover:border-muted/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
