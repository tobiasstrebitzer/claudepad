// The "vault": a read-only view over a connected ~/.claude/projects folder.
//
// Chromium-only (File System Access API). Everything is local - scanning reads
// only directory entries and per-file size/mtime (cheap stat-level metadata), not
// session contents. Contents are read lazily, one session at a time, on click.

import { extractSessionMeta } from '@/ingest'

const SESSION_RE = /\.jsonl$/i

// Claude Code stores delegated subagent runs beside the parent session, in
// `<project>/<sessionId>/subagents/agent-<id>.jsonl`, each with a tiny
// `agent-<id>.meta.json` sidecar naming the agent type. They hold real turns and
// real token spend, so a scan that stops at the project's top level silently
// undercounts every delegated workflow - which, once you work through subagents,
// is most of the fan-out. They are listed separately from `sessions`: a
// delegated run is not a session, and folding it into that list would inflate
// the session count and the parallelism metric alike.
const SUBAGENTS_DIR = 'subagents'
const AGENT_RUN_RE = /^agent-.*\.jsonl$/i

// Title/branch/cwd live in tiny records Claude Code appends at the END of each
// session file (per turn), so a tail slice captures them without reading the
// whole (potentially multi-MB) session. 64KB comfortably covers the trailing
// meta block even after a huge final message.
const META_TAIL_BYTES = 64 * 1024

export interface VaultSession {
  /** session id = file name without the .jsonl suffix */
  id: string
  fileName: string
  /** display title: ai-title → last prompt → first prompt → short id */
  title: string
  /** git branch at the session's last recorded turn */
  branch?: string
  /** the session's working directory (for "open in editor"), when recorded */
  cwd?: string
  handle: FileSystemFileHandle
  size: number
  lastModified: number
}

/**
 * A delegated subagent run: one `agent-*.jsonl` under a session's `subagents/`.
 * Metadata (agent type, task description) lives in the sidecar, which is read
 * lazily by the usage worker - the scan stays stat-only.
 */
export interface VaultAgentRun {
  /** File stem, e.g. `agent-acdb9b4a0514233d2`. */
  id: string
  fileName: string
  /** The session this run was delegated from. */
  parentSessionId: string
  handle: FileSystemFileHandle
  /** The `.meta.json` sidecar, when present. */
  metaHandle?: FileSystemFileHandle
  size: number
  lastModified: number
}

export interface VaultProject {
  /** the on-disk (encoded) directory name - stable, used as a key */
  id: string
  /** short, human label (last path segments of the decoded cwd) */
  label: string
  /** best-effort decoded project path (lossy - see decodeProjectPath) */
  path: string
  handle: FileSystemDirectoryHandle
  sessions: VaultSession[]
  /** Delegated subagent runs across every session in this project. */
  agentRuns: VaultAgentRun[]
  /** newest session mtime, for sorting projects by recency */
  lastModified: number
}

export function isVaultSupported(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  )
}

/** Open the OS folder picker. Reuses the last location via the stable `id`. */
export async function pickProjectsRoot(): Promise<FileSystemDirectoryHandle> {
  // showDirectoryPicker is guarded by isVaultSupported() at every call site.
  return window.showDirectoryPicker!({ id: 'claude-projects', mode: 'read' })
}

/**
 * Resolve read permission for a handle. `request: false` only queries (safe with
 * no user gesture, used on restore); `request: true` may prompt (needs a gesture).
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean
): Promise<PermissionState> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' }
  const current = handle.queryPermission ? await handle.queryPermission(opts) : 'granted'
  if (current === 'granted' || !request || !handle.requestPermission) return current
  return handle.requestPermission(opts)
}

export async function readSessionFile(session: VaultSession): Promise<File> {
  return session.handle.getFile()
}

interface DirEntry { name: string; handle: FileSystemDirectoryHandle }
interface FileEntry { name: string; handle: FileSystemFileHandle }

async function listDir(
  dir: FileSystemDirectoryHandle
): Promise<{ dirs: DirEntry[]; files: FileEntry[] }> {
  const dirs: DirEntry[] = []
  const files: FileEntry[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      dirs.push({ name: entry.name, handle: entry as FileSystemDirectoryHandle })
    } else {
      files.push({ name: entry.name, handle: entry as FileSystemFileHandle })
    }
  }
  return { dirs, files }
}

/** Read the file's trailing slice (whole file if small), starting at a line boundary. */
async function readTail(file: File): Promise<string> {
  if (file.size <= META_TAIL_BYTES) return file.text()
  const text = await file.slice(file.size - META_TAIL_BYTES).text()
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(nl + 1) // drop the partial leading line
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

async function readSession(
  f: FileEntry
): Promise<{ session: VaultSession; cwd?: string }> {
  const file = await f.handle.getFile()
  const meta = extractSessionMeta(await readTail(file))
  const id = f.name.replace(SESSION_RE, '')
  return {
    cwd: meta.cwd,
    session: {
      id,
      fileName: f.name,
      title: meta.title ?? shortId(id),
      branch: meta.gitBranch,
      cwd: meta.cwd,
      handle: f.handle,
      size: file.size,
      lastModified: file.lastModified
    }
  }
}

/**
 * Delegated runs under one session's directory (`<sessionId>/subagents/`).
 * Stat-only, like the session scan: the `.meta.json` sidecar handle is carried
 * along but not opened here.
 */
async function readAgentRuns(
  parentSessionId: string,
  sessionDir: FileSystemDirectoryHandle
): Promise<VaultAgentRun[]> {
  let subagents: FileSystemDirectoryHandle
  try {
    subagents = await sessionDir.getDirectoryHandle(SUBAGENTS_DIR)
  } catch {
    return [] // no delegated runs for this session
  }

  const { files } = await listDir(subagents)
  const metaByStem = new Map<string, FileSystemFileHandle>()
  for (const f of files) {
    if (f.name.endsWith('.meta.json')) metaByStem.set(f.name.slice(0, -'.meta.json'.length), f.handle)
  }

  const runs = await Promise.all(
    files
      .filter((f) => AGENT_RUN_RE.test(f.name))
      .map(async (f): Promise<VaultAgentRun> => {
        const file = await f.handle.getFile()
        const id = f.name.replace(SESSION_RE, '') // strip .jsonl, keep the agent- stem
        const meta = metaByStem.get(id)
        return {
          id,
          fileName: f.name,
          parentSessionId,
          handle: f.handle,
          ...(meta ? { metaHandle: meta } : {}),
          size: file.size,
          lastModified: file.lastModified
        }
      })
  )
  return runs
}

async function buildProject(
  id: string,
  handle: FileSystemDirectoryHandle,
  files: FileEntry[],
  dirs: DirEntry[] = []
): Promise<VaultProject | null> {
  const sessionFiles = files.filter((f) => SESSION_RE.test(f.name))
  if (sessionFiles.length === 0) return null

  const built = await Promise.all(sessionFiles.map(readSession))
  built.sort((a, b) => b.session.lastModified - a.session.lastModified)
  const sessions = built.map((b) => b.session)

  // A session's delegated runs live in a sibling directory named for the
  // session id. Scan every such directory, not just ones with a matching
  // transcript, so runs whose parent .jsonl was pruned still count.
  const agentRuns = (await Promise.all(dirs.map((d) => readAgentRuns(d.name, d.handle)))).flat()

  // The real project path comes from the session's cwd (authoritative over the
  // lossy encoded dir name); prefer the most recent session that recorded one.
  const path = built.find((b) => b.cwd)?.cwd ?? decodeProjectPath(id)
  return {
    id,
    label: projectLabel(path),
    path,
    handle,
    sessions,
    agentRuns,
    lastModified: sessions[0]?.lastModified ?? 0
  }
}

/**
 * Scan a connected folder into projects → sessions. Forgiving about what the user
 * picked: ~/.claude (descends into `projects/`), ~/.claude/projects, or even a
 * single project directory.
 */
export async function scanVault(
  root: FileSystemDirectoryHandle
): Promise<VaultProject[]> {
  const top = await listDir(root)

  // ~/.claude → descend into projects/. Otherwise treat `root` as projects-root.
  const projectsDir = top.dirs.find((d) => d.name === 'projects')
  const projectsRoot = projectsDir ? projectsDir.handle : root
  const childDirs = projectsDir ? (await listDir(projectsDir.handle)).dirs : top.dirs

  const projects: VaultProject[] = []
  for (const d of childDirs) {
    const { files, dirs } = await listDir(d.handle)
    const project = await buildProject(d.name, d.handle, files, dirs)
    if (project) projects.push(project)
  }

  // Fallback: the user picked a single project directory (sessions sit at the top).
  if (projects.length === 0 && !projectsDir) {
    const self = await buildProject(projectsRoot.name, projectsRoot, top.files, top.dirs)
    if (self) projects.push(self)
  }

  projects.sort((a, b) => b.lastModified - a.lastModified)
  return projects
}

/**
 * Claude Code encodes a project's cwd by replacing path separators with '-'
 * (e.g. `-Users-me-projects-app`). This is lossy for directory names that
 * themselves contain '-', so the result is a best-effort label, not a path we
 * can round-trip. The real cwd is available inside the session (meta.cwd) once
 * parsed - a possible future enrichment.
 */
function decodeProjectPath(encoded: string): string {
  return encoded.replace(/-/g, '/')
}

function projectLabel(path: string): string {
  const segs = path.split('/').filter(Boolean)
  return segs.slice(-2).join('/') || path || 'project'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact relative time ("3h ago"). `now` is injectable for testability. */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  const days = Math.floor(diff / DAY)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}
