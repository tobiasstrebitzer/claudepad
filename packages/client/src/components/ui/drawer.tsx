import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../../lib/cn';

// Drawer (FR-11) — an off-canvas Dialog variant that slides from the side.
// Reuses Base UI Dialog's modal + backdrop machinery.
export function Drawer(props: React.ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root {...props} />;
}

export function DrawerTrigger(props: React.ComponentProps<typeof BaseDialog.Trigger>) {
  return <BaseDialog.Trigger data-slot="drawer-trigger" {...props} />;
}

export function DrawerContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup> & { side?: 'left' | 'right' }) {
  const sidePos =
    side === 'left'
      ? 'left-0 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full border-r'
      : 'right-0 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full border-l';
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
        data-slot="drawer-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-[20rem] max-w-[calc(100vw-3rem)] flex-col',
          'border-border bg-surface p-6 text-text shadow-[var(--shadow-md)]',
          'transition-transform duration-[var(--motion-slow)] ease-[var(--ease-emphasized)]',
          sidePos,
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DrawerTitle({
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

export function DrawerDescription({
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

export const DrawerClose = BaseDialog.Close;
