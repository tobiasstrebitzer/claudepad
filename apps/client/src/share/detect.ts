// Zero-dependency blob sniffing so the ingest surface can tell an encrypted share
// (`cp-blob-…`) apart from a raw `.jsonl` session and route it to decrypt instead
// of the parser. Kept import-free on purpose: useSession imports this without
// pulling in the crypto/UI of the rest of share/**.

export const CP_BLOB_PREFIX = 'cp-blob-'

/** True when `text` looks like a serialized trustless share (a `cp-blob-…`). */
export function isShareBlob(text: string): boolean {
  return text.trimStart().startsWith(CP_BLOB_PREFIX)
}

/**
 * True when `text` is a registry short link to an opaque blob - a bare https
 * URL whose path is `…/blobs/<id>`. Registry-agnostic on purpose (no hardwired
 * host): it keys off the `/blobs/<id>` path shape so any conformant registry's
 * link routes to receive→fetch-by-id instead of the session parser.
 */
export function isShareLink(text: string): boolean {
  const t = text.trim()
  if (/\s/.test(t)) return false // a link is a single token, never a pasted session
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return /\/blobs\/[^/]+\/?$/.test(u.pathname)
  } catch {
    return false
  }
}
