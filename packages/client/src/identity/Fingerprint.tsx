// The human-verifiable fingerprint, rendered (PRD-10 FR-10…FR-12). Emoji are
// fast to read aloud; the 8-hex code is ALWAYS shown beside them as the exact,
// accessible fallback for emoji/color-blind users (FR-12). Shown in three places
// (FR-11): your own identity, a pasted recipient key (PRD-11), and a decrypted
// blob's sender (PRD-11).

import * as React from 'react'
import { fingerprint } from '@claudepad/shared'
import { cn } from '../lib/cn'

/** Compute a key's fingerprint, recomputing only when the raw key changes. */
export function useFingerprint(pub: string | undefined): {
  emoji: string
  code: string
} | null {
  const [fp, setFp] = React.useState<{ emoji: string; code: string } | null>(null)
  React.useEffect(() => {
    if (!pub) {
      setFp(null)
      return
    }
    let live = true
    void fingerprint(pub).then((f) => live && setFp(f))
    return () => {
      live = false
    }
  }, [pub])
  return fp
}

export function Fingerprint({
  pub,
  className,
  size = 'md'
}: {
  pub: string | undefined
  className?: string
  size?: 'sm' | 'md'
}) {
  const fp = useFingerprint(pub)
  if (!fp) {
    return (
      <span className={cn('text-body-sm text-muted-foreground', className)} aria-hidden>
        computing…
      </span>
    )
  }
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      // The emoji+code pair IS the identity check; expose both to screen readers.
      aria-label={`Fingerprint ${fp.code}`}
      title={`Fingerprint ${fp.code}`}
    >
      <span className={cn('tracking-[0.15em]', size === 'sm' ? 'text-body-sm' : 'text-body')}>
        {fp.emoji}
      </span>
      <span
        className={cn(
          'font-mono tabular-nums text-muted-foreground',
          size === 'sm' ? 'text-label' : 'text-body-sm'
        )}
      >
        {fp.code}
      </span>
    </span>
  )
}
