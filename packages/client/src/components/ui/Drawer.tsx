import { cn } from '@/lib/utils'
import { type ComponentProps, type FunctionComponent } from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

export const Drawer: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Root>> = ({ ...props }) => {
  return <DrawerPrimitive.Root data-slot='drawer' {...props} />
}

export const DrawerTrigger: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Trigger>> = ({ ...props }) => {
  return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...props} />
}

export const DrawerPortal: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Portal>> = ({ ...props }) => {
  return <DrawerPrimitive.Portal data-slot='drawer-portal' {...props} />
}

export const DrawerClose: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Close>> = ({ ...props }) => {
  return <DrawerPrimitive.Close data-slot='drawer-close' {...props} />
}

export const DrawerOverlay: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Overlay>> = ({
  className,
  ...props
}) => {
  return (
    <DrawerPrimitive.Overlay
      data-slot='drawer-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  )
}

export const DrawerContent: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Content>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <DrawerPortal data-slot='drawer-portal'>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot='drawer-content'
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-popover text-sm text-popover-foreground data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm',
          className
        )}
        {...props}>
        <div className='mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block' />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

export const DrawerHeader: FunctionComponent<ComponentProps<'div'>> = ({ className, ...props }) => {
  return (
    <div
      data-slot='drawer-header'
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        className
      )}
      {...props}
    />
  )
}

export const DrawerFooter: FunctionComponent<ComponentProps<'div'>> = ({ className, ...props }) => {
  return <div data-slot='drawer-footer' className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

export const DrawerTitle: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Title>> = ({
  className,
  ...props
}) => {
  return (
    <DrawerPrimitive.Title
      data-slot='drawer-title'
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  )
}

export const DrawerDescription: FunctionComponent<ComponentProps<typeof DrawerPrimitive.Description>> = ({
  className,
  ...props
}) => {
  return (
    <DrawerPrimitive.Description
      data-slot='drawer-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}
