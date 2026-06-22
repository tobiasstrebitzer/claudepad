import type { ContentBlock, SessionEvent } from '@claudepad/schema'
import type { RenderRow } from './useCorrelateTools'

/**
 * User-facing event groups for the transcript filter. A pure classification over
 * render rows so the viewer AND the playback engine filter identically (same
 * visibility -> same rows -> aligned reveal indices).
 */
export type EventGroup = 'messages' | 'tools' | 'commands' | 'bash' | 'system'

export type EventVisibility = Record<EventGroup, boolean>

export const EVENT_GROUPS: ReadonlyArray<{ key: EventGroup; label: string; hint: string }> = [
  { key: 'messages', label: 'User & agent messages', hint: 'The conversation turns' },
  { key: 'tools', label: 'Tool calls', hint: 'Read, Edit, Write, web, MCP, …' },
  { key: 'bash', label: 'Bash', hint: 'Shell commands' },
  { key: 'commands', label: 'Commands', hint: 'Slash-command invocations' },
  { key: 'system', label: 'System', hint: 'Command output, reminders, away summaries' }
]

/** System is noisy by default; everything else shows. */
export const DEFAULT_VISIBILITY: EventVisibility = {
  messages: true,
  tools: true,
  commands: true,
  bash: true,
  system: false
}

/** Show-everything config (used as the engine default when no filter is wired). */
export const ALL_VISIBLE: EventVisibility = {
  messages: true,
  tools: true,
  commands: true,
  bash: true,
  system: true
}

function firstText(blocks: ContentBlock[]): string {
  for (const b of blocks) if (b.type === 'text') return b.text
  return ''
}

/** A user turn that is a slash-command invocation (`<command-name>…`). */
export function isSlashCommandEvent(event: SessionEvent): boolean {
  return event.kind === 'user' && firstText(event.content).trimStart().startsWith('<command-name>')
}

/** A `system` record carrying local slash-command output. */
export function isLocalCommandEvent(event: SessionEvent): boolean {
  return event.kind === 'meta' && event.subtype === 'local_command'
}

/** Injected/system-ish user turns (caveats, reminders, away/idle context). */
function isSystemUser(event: SessionEvent): boolean {
  if (event.kind !== 'user') return false
  if (event.meta === true) return true
  const t = firstText(event.content).trimStart()
  return t.startsWith('<system-reminder>') || t.startsWith('<local-command-caveat>')
}

/** Classify a render row into its display group. */
export function rowGroup(row: RenderRow): EventGroup {
  if (row.kind === 'tool') return row.event.name === 'Bash' ? 'bash' : 'tools'
  if (row.kind === 'orphan-result') return row.event.forName === 'Bash' ? 'bash' : 'tools'

  const event = row.event
  switch (event.kind) {
    case 'user':
      if (isSlashCommandEvent(event)) return 'commands'
      if (isSystemUser(event)) return 'system'
      return 'messages'
    case 'assistant':
    case 'thinking':
      return 'messages'
    case 'meta':
    default:
      return 'system'
  }
}

/** Drop rows whose group is toggled off. Pure; preserves order. */
export function filterRows(rows: readonly RenderRow[], vis: EventVisibility): RenderRow[] {
  return rows.filter((row) => vis[rowGroup(row)])
}
