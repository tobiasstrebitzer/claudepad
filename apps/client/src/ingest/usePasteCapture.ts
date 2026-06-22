import * as React from 'react'

// Window-level paste capture (PRD-04 FR-5), gated to when it's safe (e.g. the empty
// state). Ignores pastes that target an editable field so it never hijacks typing.
export function usePasteCapture(enabled: boolean, onText: (text: string) => void) {
  const cb = React.useRef(onText)
  cb.current = onText

  React.useEffect(() => {
    if (!enabled) return
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const text = e.clipboardData?.getData('text') ?? ''
      if (text.trim() === '') return
      e.preventDefault()
      cb.current(text)
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [enabled])
}
