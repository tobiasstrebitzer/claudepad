// Lightweight session metadata extraction (PRD-04).
//
// Claude Code appends small trailing records to each session's JSONL on every turn
// - `ai-title` (the generated short summary shown in `/resume`), `last-prompt`,
// and `cwd`/`gitBranch` on message lines. They live in the last ~1KB of the file,
// so a caller can feed us just the tail (see the client's vault) and avoid parsing
// a multi-MB session. This module is pure and isomorphic; it never throws.

export interface SessionFileMeta {
  /** Resolved display title: ai-title → last prompt → first usable user prompt. */
  title?: string
  /** The generated ai-title verbatim, if present. */
  aiTitle?: string
  /** Most recent git branch seen. */
  gitBranch?: string
  /** Working directory (the real project path - authoritative over the dir name). */
  cwd?: string
}

type Unknown = Record<string, unknown>

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/** Flatten a user message's `content` (string or block array) into plain text. */
function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === 'object' && typeof (b as Unknown).text === 'string'
          ? ((b as Unknown).text as string)
          : ''
      )
      .join(' ')
  }
  return ''
}

/**
 * Turn raw prompt/message text into a one-line title, or undefined if it carries
 * no human signal. Slash commands are surfaced as-is (e.g. `/mcp`); the local-
 * command and command wrapper tags Claude Code injects are stripped.
 */
export function cleanTitleText(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const cmd = raw.match(/<command-name>([^<]+)<\/command-name>/)
  if (cmd?.[1]) return cmd[1].trim()
  const stripped = raw
    // Remove Claude Code's local-command / command wrapper blocks *with* their
    // inner text (the caveat boilerplate carries no title signal), then any
    // remaining tags.
    .replace(/<local-command-[a-z]+>[\s\S]*?<\/local-command-[a-z]+>/gi, ' ')
    .replace(/<command-[a-z]+>[\s\S]*?<\/command-[a-z]+>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return undefined
  return stripped.length > 90 ? `${stripped.slice(0, 90).trimEnd()}…` : stripped
}

/**
 * Scan JSONL text (typically the file tail) for session metadata. Tolerant:
 * non-JSON or unexpected lines are skipped. Returns the last value seen for each
 * field (records are append-only, so latest wins).
 */
export function extractSessionMeta(text: string): SessionFileMeta {
  let aiTitle: string | undefined
  let lastPrompt: string | undefined
  let gitBranch: string | undefined
  let cwd: string | undefined
  let firstUserTitle: string | undefined

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed?.startsWith('{')) continue
    let rec: Unknown
    try {
      rec = JSON.parse(trimmed) as Unknown
    } catch {
      continue
    }

    switch (rec.type) {
      case 'ai-title':
        aiTitle = str(rec.aiTitle) ?? aiTitle
        break
      case 'last-prompt':
        lastPrompt = str(rec.lastPrompt) ?? lastPrompt
        break
      case 'user':
        if (!firstUserTitle) {
          const msg = rec.message as Unknown | undefined
          firstUserTitle = cleanTitleText(textFromContent(msg?.content))
        }
        break
    }

    if (str(rec.gitBranch)) gitBranch = str(rec.gitBranch)
    if (str(rec.cwd)) cwd = str(rec.cwd)
  }

  const title = aiTitle?.trim() || cleanTitleText(lastPrompt) || firstUserTitle || undefined
  return { title, aiTitle, gitBranch, cwd }
}
