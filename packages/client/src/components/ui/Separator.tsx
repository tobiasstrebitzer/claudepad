import { cn } from '@/lib/utils'
import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
import { type FunctionComponent } from 'react'

export const Separator: FunctionComponent<SeparatorPrimitive.Props> = ({
  className,
  orientation = 'horizontal',
  ...props
}) => {
  return (
    <SeparatorPrimitive
      data-slot='separator'
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        className
      )}
      {...props}
    />
  )
}
