import { Avatar as BaseAvatar } from '@base-ui-components/react/avatar';
import { cn } from '../../lib/cn';

// Avatar (FR-11) on Base UI. Circular; fallback initials on accent fill.
export function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Root>) {
  return (
    <BaseAvatar.Root
      data-slot="avatar"
      className={cn(
        'inline-flex size-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-sidebar align-middle',
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Image>) {
  return (
    <BaseAvatar.Image
      data-slot="avatar-image"
      className={cn('size-full object-cover', className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Fallback>) {
  return (
    <BaseAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center bg-accent text-body-sm font-medium text-accent-fg',
        className,
      )}
      {...props}
    />
  );
}
