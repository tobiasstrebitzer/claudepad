import * as React from 'react'

/** Decrypted secret values, supplied only for high-priv viewers (from PRD-05). */
export type SecretMap = Record<string, { type: string; value: string }>

interface RevealState {
  /** Whether a secret map is present at all (=> reveal affordances exist). */
  readonly hasMap: boolean
  /** Per-id revealed flags. Default (absent) === hidden (shoulder-surf safety). */
  readonly revealed: ReadonlySet<string>
  /** Resolve the real value for an id, or undefined (partial/stale map). */
  valueFor(id: string): { type: string; value: string } | undefined
  /** True if this id is currently revealed. */
  isRevealed(id: string): boolean
  toggle(id: string): void
  reveal(id: string): void
  hide(id: string): void
  revealAll(): void
  hideAll(): void
}

const RevealContext = React.createContext<RevealState | null>(null)

export function RevealProvider({
  secretMap,
  children
}: {
  secretMap?: SecretMap
  children: React.ReactNode
}) {
  const [revealed, setRevealed] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )

  // If the map identity changes, drop any reveal state (safety: never carry
  // a revealed flag across a different secret set).
  React.useEffect(() => {
    setRevealed(new Set<string>())
  }, [secretMap])

  const value = React.useMemo<RevealState>(() => {
    const hasMap = secretMap != null
    return {
      hasMap,
      revealed,
      valueFor: (id) => secretMap?.[id],
      isRevealed: (id) => revealed.has(id),
      toggle: (id) =>
        setRevealed((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      reveal: (id) =>
        setRevealed((prev) => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          return next
        }),
      hide: (id) =>
        setRevealed((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      revealAll: () => setRevealed(new Set(Object.keys(secretMap ?? {}))),
      hideAll: () => setRevealed(new Set<string>())
    }
  }, [secretMap, revealed])

  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>
}

/** Access reveal state. Safe even outside a provider (acts as no-map). */
export function useReveal(): RevealState {
  const ctx = React.useContext(RevealContext)
  if (ctx) return ctx
  // Fallback: no provider => behave as a low-priv viewer with no map.
  return NO_MAP
}

const noop = () => {}
const NO_MAP: RevealState = {
  hasMap: false,
  revealed: new Set<string>(),
  valueFor: () => undefined,
  isRevealed: () => false,
  toggle: noop,
  reveal: noop,
  hide: noop,
  revealAll: noop,
  hideAll: noop
}
