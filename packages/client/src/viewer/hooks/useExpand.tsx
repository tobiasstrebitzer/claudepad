import * as React from 'react';

/**
 * Cross-cutting "expand all / collapse all" signal. A monotonically-changing
 * `epoch` + the target state lets each collapsible reset its LOCAL state when a
 * bulk command fires, while keeping per-block control between commands. Turn
 * components stay pure: they read this signal and own only their own collapse.
 */
export type ExpandKind = 'all' | 'thinking' | 'toolIO';

export interface ExpandSignal {
  /** Increments on every bulk command. */
  readonly epoch: number;
  /** Desired open state for the last command. */
  readonly open: boolean;
  /** Which category the last command targeted. */
  readonly kind: ExpandKind;
  expandAll(kind?: ExpandKind): void;
  collapseAll(kind?: ExpandKind): void;
}

const ExpandContext = React.createContext<ExpandSignal | null>(null);

export function ExpandProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState({
    epoch: 0,
    open: false,
    kind: 'all' as ExpandKind,
  });

  const value = React.useMemo<ExpandSignal>(
    () => ({
      epoch: state.epoch,
      open: state.open,
      kind: state.kind,
      expandAll: (kind = 'all') =>
        setState((s) => ({ epoch: s.epoch + 1, open: true, kind })),
      collapseAll: (kind = 'all') =>
        setState((s) => ({ epoch: s.epoch + 1, open: false, kind })),
    }),
    [state],
  );

  return <ExpandContext.Provider value={value}>{children}</ExpandContext.Provider>;
}

export function useExpandSignal(): ExpandSignal | null {
  return React.useContext(ExpandContext);
}

/**
 * Collapsible state that respects bulk expand/collapse for a given category.
 * `defaultOpen` is the initial per-block state; a bulk command for `category`
 * (or `'all'`) overrides it until the user toggles again.
 */
export function useCollapsibleState(
  category: Exclude<ExpandKind, 'all'>,
  defaultOpen: boolean,
): [boolean, (open: boolean) => void] {
  const signal = useExpandSignal();
  const [open, setOpen] = React.useState(defaultOpen);
  const lastEpoch = React.useRef(signal?.epoch ?? 0);

  React.useEffect(() => {
    if (!signal) return;
    if (signal.epoch === lastEpoch.current) return;
    lastEpoch.current = signal.epoch;
    if (signal.kind === 'all' || signal.kind === category) {
      setOpen(signal.open);
    }
  }, [signal, category]);

  return [open, setOpen];
}
