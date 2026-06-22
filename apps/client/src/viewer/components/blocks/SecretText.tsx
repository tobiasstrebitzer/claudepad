import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { splitSecretTokens, type SecretPlaceholder } from '../../secret-token'
import { useReveal } from '../../hooks/useReveal'

const FIXED_DOTS = '••••••••' // cosmetic, always 8 - never reflects real length.

/**
 * Renders a string, turning any embedded secret placeholder tokens into inline
 * chips. Plain text passes through untouched. This is injected into the
 * markdown renderer's text nodes so a placeholder always renders as one atomic
 * chip and a revealed value can never be re-parsed as markdown/HTML.
 */
export function SecretText({ children }: { children: string }) {
  const segments = React.useMemo(() => splitSecretTokens(children), [children])
  if (segments.length === 1 && segments[0]?.kind === 'text') {
    return <>{children}</>
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ) : (
          <SecretChip key={i} placeholder={seg.placeholder} />
        )
      )}
    </>
  )
}

export function SecretChip({ placeholder }: { placeholder: SecretPlaceholder }) {
  const reveal = useReveal()
  const entry = reveal.valueFor(placeholder.id)
  const canReveal = reveal.hasMap && entry != null
  const isRevealed = canReveal && reveal.isRevealed(placeholder.id)

  if (isRevealed && entry) {
    // Distinct clay-bordered chip. Value is INERT text (never re-parsed).
    return (
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-sm',
          'border border-accent bg-accent-tint px-1.5 py-0.5 align-baseline',
          'font-mono text-code text-text'
        )}
        data-secret-revealed="true"
      >
        <span className="overflow-hidden text-ellipsis">{entry.value}</span>
        <button
          type="button"
          onClick={() => reveal.hide(placeholder.id)}
          aria-label={`Hide ${placeholder.type}`}
          className="shrink-0 text-accent hover:text-accent-hover"
        >
          <EyeOff className="size-3" />
        </button>
      </span>
    )
  }

  // Placeholder chip: type + fixed dots + real length. No value substring/hash.
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-border',
        'bg-surface px-1.5 py-0.5 align-baseline font-mono text-code text-muted-foreground'
      )}
      data-secret-placeholder={placeholder.id}
      data-secret-type={placeholder.type}
    >
      <span aria-label={`Redacted ${placeholder.type}, length ${placeholder.len}`}>
        {placeholder.type} {FIXED_DOTS}({placeholder.len})
      </span>
      {canReveal && (
        <button
          type="button"
          onClick={() => reveal.reveal(placeholder.id)}
          aria-label={`Reveal ${placeholder.type}`}
          className="shrink-0 text-accent hover:text-accent-hover"
        >
          <Eye className="size-3" />
        </button>
      )}
    </span>
  )
}
