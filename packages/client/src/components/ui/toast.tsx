import { Toast as BaseToast } from '@base-ui-components/react/toast';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

// Toast (FR-11) on Base UI. A module-level manager lets `toast(...)` be called
// from anywhere (outside React) — the ToastProvider is wired to the same manager.
const manager = BaseToast.createToastManager();

export function toast(options: Parameters<typeof manager.add>[0]) {
  return manager.add(options);
}

export function ToastProvider({
  children,
  ...props
}: React.ComponentProps<typeof BaseToast.Provider>) {
  return (
    <BaseToast.Provider toastManager={manager} {...props}>
      {children}
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((t) => (
    <BaseToast.Root
      key={t.id}
      toast={t}
      data-slot="toast"
      className={cn(
        'relative flex w-[20rem] flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-text shadow-[var(--shadow-md)]',
        'transition-[opacity,transform] duration-[150ms] ease-[var(--ease-standard)]',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
      )}
    >
      <BaseToast.Title className="text-body-sm font-medium text-text" />
      <BaseToast.Description className="text-body-sm text-muted" />
      <BaseToast.Close
        aria-label="Close"
        className={cn(
          'absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-sm text-muted',
          'transition-colors duration-[120ms] ease-[var(--ease-standard)] hover:bg-sidebar hover:text-text',
        )}
      >
        <X className="size-4" />
      </BaseToast.Close>
    </BaseToast.Root>
  ));
}

export function Toaster() {
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport
        data-slot="toaster"
        className="fixed bottom-4 right-4 z-[60] flex w-[20rem] flex-col gap-2 outline-none"
      >
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
