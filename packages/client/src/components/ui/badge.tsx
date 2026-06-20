import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

// Badge (FR-11). PRD-06 will use `warn`/`danger` for unredacted-secret warnings
// and `mono` for opaque placeholder chips like `[AWS_KEY ••••••••(20)]`.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-sidebar text-muted',
        accent: 'border-transparent bg-accent-tint text-accent',
        success: 'border-transparent bg-success/15 text-success',
        warn: 'border-transparent bg-warn/15 text-warn',
        danger: 'border-transparent bg-danger/15 text-danger',
        mono: 'border-border bg-surface font-mono text-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
