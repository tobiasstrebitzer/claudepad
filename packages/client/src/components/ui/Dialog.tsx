import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'
import { type ComponentProps, type FunctionComponent } from 'react'

export const Dialog: FunctionComponent<DialogPrimitive.Root.Props> = ({ ...props }) => {
  return <DialogPrimitive.Root data-slot='dialog' {...props} />
}

export const DialogTrigger: FunctionComponent<DialogPrimitive.Trigger.Props> = ({ ...props }) => {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' {...props} />
}

export const DialogPortal: FunctionComponent<DialogPrimitive.Portal.Props> = ({ ...props }) => {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...props} />
}

export const DialogClose: FunctionComponent<DialogPrimitive.Close.Props> = ({ ...props }) => {
  return <DialogPrimitive.Close data-slot='dialog-close' {...props} />
}

export const DialogOverlay: FunctionComponent<DialogPrimitive.Backdrop.Props> = ({ className, ...props }) => {
  return (
    <DialogPrimitive.Backdrop
      data-slot='dialog-overlay'
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  )
}

export const DialogContent: FunctionComponent<DialogPrimitive.Popup.Props & { showCloseButton?: boolean }> = ({
  className,
  children,
  showCloseButton = true,
  ...props
}) => {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot='dialog-content'
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className
        )}
        {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot='dialog-close'
            render={<Button variant='ghost' className='absolute top-4 right-4' size='icon-sm' />}>
            <XIcon />
            <span className='sr-only'>Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

export const DialogHeader: FunctionComponent<ComponentProps<'div'>> = ({ className, ...props }) => {
  return <div data-slot='dialog-header' className={cn('flex flex-col gap-2', className)} {...props} />
}

export const DialogFooter: FunctionComponent<ComponentProps<'div'> & { showCloseButton?: boolean }> = ({
  className,
  showCloseButton = false,
  children,
  ...props
}) => {
  return (
    <div
      data-slot='dialog-footer'
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}>
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant='outline' />}>Close</DialogPrimitive.Close>}
    </div>
  )
}

export const DialogTitle: FunctionComponent<DialogPrimitive.Title.Props> = ({ className, ...props }) => {
  return (
    <DialogPrimitive.Title data-slot='dialog-title' className={cn('leading-none font-medium', className)} {...props} />
  )
}

export const DialogDescription: FunctionComponent<DialogPrimitive.Description.Props> = ({ className, ...props }) => {
  return (
    <DialogPrimitive.Description
      data-slot='dialog-description'
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  )
}
