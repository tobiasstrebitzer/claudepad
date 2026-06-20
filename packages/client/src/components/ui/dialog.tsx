import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../../lib/cn';

// Dialog (FR-11) on Base UI. Centered surface popup over a dimmed backdrop;
// enter/exit motion via data-[starting-style]/data-[ending-style] (--motion-slow).
export function Dialog(props: React.ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root {...props} />;
}

export function DialogTrigger(props: React.ComponentProps<typeof BaseDialog.Trigger>) {
  return <BaseDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn(
          'fixed inset-0 z-40 bg-text/30',
          'transition-opacity duration-[var(--motion-slow)] ease-[var(--ease-emphasized)]',
          'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        )}
      />
      <BaseDialog.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border bg-surface p-6 text-text shadow-[var(--shadow-md)]',
          'origin-center',
          'transition-[opacity,transform] duration-[var(--motion-slow)] ease-[var(--ease-emphasized)]',
          'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
          'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn('text-heading-3 font-semibold text-text', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn('mt-2 text-body-sm text-muted', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('mt-6 flex items-center justify-end gap-2', className)}
      {...props}
    />
  );
}

export const DialogClose = BaseDialog.Close;
