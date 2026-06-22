import { cn } from '@/lib/utils'
import { type ComponentProps, type FunctionComponent } from 'react'

export const Skeleton: FunctionComponent<ComponentProps<'div'>> = ({ className, ...props }) => {
  return <div data-slot='skeleton' className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}
