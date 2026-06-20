import * as React from 'react';

// Small clipboard helper with a transient "copied" flag (used by code copy, the
// onboarding one-liner, and deep links). Falls back gracefully if clipboard is denied.
export function useCopy(resetMs = 1500): [copied: boolean, copy: (text: string) => void] {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback(
    (text: string) => {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), resetMs);
        })
        .catch(() => {});
    },
    [resetMs],
  );

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return [copied, copy];
}
