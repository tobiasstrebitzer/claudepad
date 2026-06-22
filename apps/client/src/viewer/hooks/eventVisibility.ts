import type { SessionEvent } from '@claudepad/schema'

/**
 * Pure session-metadata and UI-internal telemetry that only adds noise when
 * rendered inline in the transcript. These are still preserved in the raw
 * session view (nothing is lost) - the viewer just doesn't surface them as
 * conversation rows. See DECISIONS.md D-61.
 *
 * Matched on a meta event's `subtype` (the schema sets subtype === the source
 * record `type` for session-meta records, and the system `subtype` for system
 * records).
 */
const HIDDEN_META_SUBTYPES = new Set<string>([
  // Session-scoped metadata records (schema SESSION_META_TYPES).
  'ai-title',
  'mode',
  'permission-mode',
  'last-prompt',
  'file-history-snapshot',
  'queue-operation',
  'bridge-session',
  'pr-link',
  'agent-name',
  'agent-setting',
  'summary',
  // System telemetry subtypes.
  'turn_duration',
  'bridge_status'
])

/** Attachment payload types that are tooling chatter, not conversation. */
const HIDDEN_ATTACHMENT_TYPES = new Set<string>([
  'task_reminder',
  'deferred_tools_delta',
  'skill_listing',
  'agent_listing_delta',
  'mcp_instructions_delta',
  'command_permissions',
  'queued_command',
  'hook_non_blocking_error',
  'hook_success',
  'hook_additional_context'
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** The `attachment.type` of an attachment-derived meta event, if any. */
export function attachmentType(event: SessionEvent): string | undefined {
  if (event.kind !== 'meta') return undefined
  const raw = event.raw
  if (!isRecord(raw)) return undefined
  const att = raw['attachment']
  if (!isRecord(att)) return undefined
  const t = att['type']
  return typeof t === 'string' ? t : undefined
}

/** True when an event is pure metadata/telemetry that should not render inline. */
export function isHiddenEvent(event: SessionEvent): boolean {
  if (event.kind !== 'meta') return false
  if (event.subtype && HIDDEN_META_SUBTYPES.has(event.subtype)) return true
  const att = attachmentType(event)
  if (att && HIDDEN_ATTACHMENT_TYPES.has(att)) return true
  return false
}
