import * as React from 'react'
import type { Session } from '@claudepad/schema'

/**
 * The "Raw" view: the normalized session as formatted JSON. A power-user escape
 * hatch to inspect the parsed shape behind the prettified transcript.
 */
export function RawSessionView({ session }: { session: Session }) {
  const json = React.useMemo(() => JSON.stringify(session, null, 2), [session])
  return (
    <div className="h-full overflow-auto bg-bg p-4">
      <pre className="whitespace-pre-wrap break-words font-mono text-code text-text">
        {json}
      </pre>
    </div>
  )
}
