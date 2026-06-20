import * as React from 'react';
import { cn } from '../../lib/cn';

// Textarea (FR-11/FR-12). Mirrors Input: hairline border, accent focus from globals.
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(
      'flex min-h-[80px] w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-text',
      'placeholder:text-muted',
      'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
      'hover:border-muted/60',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
