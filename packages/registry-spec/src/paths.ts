/**
 * The HTTP contract surface (REGISTRY-SPEC.md §7). One source of truth for
 * paths, shared by the reference Worker and the client SDK so they can't drift.
 */

/** Bumped only on a breaking wire change. */
export const REGISTRY_PROTOCOL_VERSION = 1

/** Where a registry serves its capability manifest. */
export const MANIFEST_PATH = '/.well-known/claudepad-registry'

/** Media type for opaque blob bodies (octet-stream by another name). */
export const BLOB_CONTENT_TYPE = 'application/octet-stream'

export const REGISTRY_PATHS = {
  manifest: MANIFEST_PATH,
  openapi: '/openapi.json',

  // Availability (zero-knowledge)
  blobs: '/blobs',
  blob: (id: string) => `/blobs/${encodeURIComponent(id)}`,
  inbox: '/inbox',

  // A human-clickable share short link. GET redirects (302) to the registry's
  // paired web app (manifest.webApp) with the blob id + this registry's URL, so
  // a click opens the session in the app. Absent webApp => the route 404s.
  share: (id: string) => `/s/${encodeURIComponent(id)}`,

  // Trusted mode (readable sessions)
  sessions: '/sessions',
  session: (id: string) => `/sessions/${encodeURIComponent(id)}`,

  // Authenticity (directory)
  directory: '/directory',
  directoryEntry: (handle: string) => `/directory/${encodeURIComponent(handle)}`
} as const

/** Query-param name for a directory search. */
export const DIRECTORY_QUERY_PARAM = 'q'

/**
 * Query params on the web-app redirect target of a share short link (`/s/:id`).
 * The app reads the blob id from `share` and the issuing registry from `r`, then
 * fetches + decrypts locally - so the link opens for anyone, with no prior setup.
 */
export const SHARE_ID_PARAM = 'share'
export const SHARE_REGISTRY_PARAM = 'r'

/** Header carrying the opt-in inbox index on a blob PUT (comma-separated pub hashes). */
export const INDEX_FOR_HEADER = 'x-claudepad-index-for'
