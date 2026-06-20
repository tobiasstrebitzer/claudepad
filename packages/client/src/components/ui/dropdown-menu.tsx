import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cn } from '../../lib/cn';

// Dropdown menu (FR-11) on Base UI Menu. Highlighted item → accent-tint.
export function DropdownMenu(props: React.ComponentProps<typeof BaseMenu.Root>) {
  return <BaseMenu.Root {...props} />;
}

export function DropdownMenuTrigger(
  props: React.ComponentProps<typeof BaseMenu.Trigger>,
) {
  return <BaseMenu.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

export function DropdownMenuContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof BaseMenu.Popup> & { sideOffset?: number }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={sideOffset}>
        <BaseMenu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'min-w-[10rem] rounded-lg border border-border bg-surface p-1 text-body-sm text-text',
            'shadow-[var(--shadow-md)]',
            'origin-[var(--transform-origin)]',
            'transition-[opacity,transform] duration-[150ms] ease-[var(--ease-standard)]',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
        'data-[highlighted]:bg-accent-tint data-[highlighted]:text-accent',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Separator>) {
  return (
    <BaseMenu.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

// A plain, presentational section label. Base UI's GroupLabel throws unless it's
// wrapped in <Menu.Group>; our menus use labels as simple dividers, so a styled
// div is both correct and crash-proof anywhere in the popup.
export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn(
        'px-2 py-1.5 text-label uppercase tracking-[0.02em] text-muted',
        className,
      )}
      {...props}
    />
  );
}

/** Opt-in semantic grouping (wrap a DropdownMenuLabel + its items) when needed. */
export const DropdownMenuGroup = BaseMenu.Group;
