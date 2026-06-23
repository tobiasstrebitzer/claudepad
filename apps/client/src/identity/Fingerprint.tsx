// The human-verifiable fingerprint, rendered (PRD-10 FR-10…FR-12). A global
// setting picks the surface - emoji glyphs (default, fast to read aloud) or the
// 8-hex code - and the other form is always kept in the aria-label/title so
// emoji/color-blind users and screen readers get the exact code (FR-12). Shown
// for your own identity, a pasted recipient key, and a decrypted blob's sender.

import * as React from 'react'
import { fingerprint } from '@claudepad/crypto'
import { cn } from '../lib/cn'
import { useAppSettings } from '../settings/appSettings'

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
  const { fingerprintDisplay } = useAppSettings()
  if (!fp) {
    return (
      <span className={cn('text-body-sm text-muted-foreground', className)} aria-hidden>
        computing…
      </span>
    )
  }
  return (
    <span
      className={cn('inline-flex items-center', className)}
      // The emoji+code pair IS the identity check; expose both to screen readers
      // regardless of which form is shown visually (FR-12).
      aria-label={`Fingerprint ${fp.code}`}
      title={`Fingerprint ${fp.emoji}  ${fp.code}`}
    >
      {fingerprintDisplay === 'hex' ? (
        <span
          className={cn(
            'font-mono tabular-nums text-muted-foreground',
            size === 'sm' ? 'text-label' : 'text-body-sm'
          )}
        >
          {fp.code}
        </span>
      ) : (
        <span className={cn('tracking-[0.15em]', size === 'sm' ? 'text-body-sm' : 'text-body')}>
          {fp.emoji}
        </span>
      )}
    </span>
  )
}
