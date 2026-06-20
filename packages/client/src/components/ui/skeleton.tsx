import * as React from 'react';
import { cn } from '../../lib/cn';

// Skeleton (FR-11) — loading placeholder. Pulse respects reduced-motion (globals).
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-sidebar', className)}
      {...props}
    />
  );
}
