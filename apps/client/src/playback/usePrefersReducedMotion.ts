import * as React from 'react'

// Tracks the OS "reduce motion" setting (PRD-08 FR-21). Playback uses it to skip
// the typing effect and playhead easing and to scroll instantly rather than
// smoothly - while keeping every control fully functional.
export function usePrefersReducedMotion(): boolean {
  const get = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [reduced, setReduced] = React.useState(get)

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
