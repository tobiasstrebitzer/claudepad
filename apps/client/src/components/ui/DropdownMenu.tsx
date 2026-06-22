import { cn } from '@/lib/utils'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import { type ComponentProps, type FunctionComponent } from 'react'

export const DropdownMenu: FunctionComponent<MenuPrimitive.Root.Props> = ({ ...props }) => {
  return <MenuPrimitive.Root data-slot='dropdown-menu' {...props} />
}

export const DropdownMenuPortal: FunctionComponent<MenuPrimitive.Portal.Props> = ({ ...props }) => {
  return <MenuPrimitive.Portal data-slot='dropdown-menu-portal' {...props} />
}

export const DropdownMenuTrigger: FunctionComponent<MenuPrimitive.Trigger.Props> = ({ ...props }) => {
  return <MenuPrimitive.Trigger data-slot='dropdown-menu-trigger' {...props} />
}

export const DropdownMenuContent: FunctionComponent<
  MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>
> = ({ align = 'start', alignOffset = 0, side = 'bottom', sideOffset = 4, className, ...props }) => {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className='isolate z-50 outline-none'
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}>
        <MenuPrimitive.Popup
          data-slot='dropdown-menu-content'
          className={cn(
            'z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95',
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export const DropdownMenuGroup: FunctionComponent<MenuPrimitive.Group.Props> = ({ ...props }) => {
  return <MenuPrimitive.Group data-slot='dropdown-menu-group' {...props} />
}

// D-49 deviation from the generated stock primitive: Base UI's GroupLabel throws
// ("MenuGroupContext is missing") unless wrapped in <Menu.Group>. Our menus use
// labels as plain dividers, so a styled div is correct and crash-proof anywhere
// in the popup. Re-apply this if DropdownMenu is regenerated (guarded by
// test/dropdown-menu.test.tsx).
export const DropdownMenuLabel: FunctionComponent<ComponentProps<'div'> & { inset?: boolean }> = ({
  className,
  inset,
  ...props
}) => {
  return (
    <div
      data-slot='dropdown-menu-label'
      data-inset={inset}
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground data-inset:pl-8', className)}
      {...props}
    />
  )
}

export const DropdownMenuItem: FunctionComponent<
  MenuPrimitive.Item.Props & { inset?: boolean; variant?: 'default' | 'destructive' }
> = ({ className, inset, variant = 'default', ...props }) => {
  return (
    <MenuPrimitive.Item
      data-slot='dropdown-menu-item'
      data-inset={inset}
      data-variant={variant}
      className={cn(
        'group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive',
        className
      )}
      {...props}
    />
  )
}

export const DropdownMenuSub: FunctionComponent<MenuPrimitive.SubmenuRoot.Props> = ({ ...props }) => {
  return <MenuPrimitive.SubmenuRoot data-slot='dropdown-menu-sub' {...props} />
}

export const DropdownMenuSubTrigger: FunctionComponent<MenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }> = ({
  className,
  inset,
  children,
  ...props
}) => {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot='dropdown-menu-sub-trigger'
      data-inset={inset}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
        className
      )}
      {...props}>
      {children}
      <ChevronRightIcon className='ml-auto' />
    </MenuPrimitive.SubmenuTrigger>
  )
}

export const DropdownMenuSubContent: FunctionComponent<ComponentProps<typeof DropdownMenuContent>> = ({
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  className,
  ...props
}) => {
  return (
    <DropdownMenuContent
      data-slot='dropdown-menu-sub-content'
      className={cn(
        'w-auto min-w-[96px] rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        className
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

export const DropdownMenuCheckboxItem: FunctionComponent<MenuPrimitive.CheckboxItem.Props & { inset?: boolean }> = ({
  className,
  children,
  checked,
  inset,
  ...props
}) => {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot='dropdown-menu-checkbox-item'
      data-inset={inset}
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
        className
      )}
      checked={checked}
      {...props}>
      <span
        className='pointer-events-none absolute right-2 flex items-center justify-center'
        data-slot='dropdown-menu-checkbox-item-indicator'>
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

export const DropdownMenuRadioGroup: FunctionComponent<MenuPrimitive.RadioGroup.Props> = ({ ...props }) => {
  return <MenuPrimitive.RadioGroup data-slot='dropdown-menu-radio-group' {...props} />
}

export const DropdownMenuRadioItem: FunctionComponent<MenuPrimitive.RadioItem.Props & { inset?: boolean }> = ({
  className,
  children,
  inset,
  ...props
}) => {
  return (
    <MenuPrimitive.RadioItem
      data-slot='dropdown-menu-radio-item'
      data-inset={inset}
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
        className
      )}
      {...props}>
      <span
        className='pointer-events-none absolute right-2 flex items-center justify-center'
        data-slot='dropdown-menu-radio-item-indicator'>
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

export const DropdownMenuSeparator: FunctionComponent<MenuPrimitive.Separator.Props> = ({ className, ...props }) => {
  return (
    <MenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export const DropdownMenuShortcut: FunctionComponent<ComponentProps<'span'>> = ({ className, ...props }) => {
  return (
    <span
      data-slot='dropdown-menu-shortcut'
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground',
        className
      )}
      {...props}
    />
  )
}
