import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import { cn } from '../../lib/cn';

// Tabs (FR-11) on Base UI. Active tab carries the accent (text + underline bar).
export function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Root>) {
  return (
    <BaseTabs.Root
      data-slot="tabs"
      className={cn('flex flex-col', className)}
      {...props}
    />
  );
}

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      data-slot="tabs-list"
      className={cn('flex items-center gap-1 border-b border-border', className)}
      {...props}
    />
  );
}

export function TabsTab({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      data-slot="tabs-tab"
      className={cn(
        '-mb-px cursor-pointer border-b-2 border-transparent px-3 py-2 text-body-sm font-medium text-muted',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)]',
        'hover:text-text',
        'data-[selected]:border-accent data-[selected]:text-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      data-slot="tabs-panel"
      className={cn('pt-4 text-body text-text', className)}
      {...props}
    />
  );
}
