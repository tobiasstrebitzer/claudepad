import type { ContentBlock, UserEvent } from '@/schema'
import { Terminal } from 'lucide-react'
import * as React from 'react'
import { TurnShell } from './TurnShell'

/** The first text block of a user turn, if any. */
function firstText(blocks: ContentBlock[]): string | null {
  for (const b of blocks) if (b.type === 'text') return b.text
  return null
}

interface ParsedCommand {
  /** Includes the leading slash, e.g. "/plugin". */
  name: string
  args?: string
}

function parseCommand(text: string): ParsedCommand | null {
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/)
  if (!name?.[1]) return null
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
  return { name: name[1].trim(), args: args ? args : undefined }
}

/**
 * Renders a `/command args` invocation as a compact command chip instead of the
 * raw `<command-name>` XML wrapper.
 */
export const SlashCommandTurn = React.memo(({
  event,
  anchorId,
  highlighted
}: {
  event: UserEvent
  anchorId: string
  highlighted?: boolean
}) => {
  const parsed = React.useMemo(
    () => parseCommand(firstText(event.content) ?? ''),
    [event.content]
  )

  return (
    <TurnShell
      anchorId={anchorId}
      ts={event.ts}
      variant="user"
      roleLabel="Command"
      highlighted={highlighted}
    >
      <div className="flex items-center gap-2 font-mono text-code">
        <Terminal className="size-3.5 shrink-0 text-accent" />
        <span className="font-medium text-accent">{parsed?.name ?? '/command'}</span>
        {parsed?.args && <span className="truncate text-muted-foreground">{parsed.args}</span>}
      </div>
    </TurnShell>
  )
})
