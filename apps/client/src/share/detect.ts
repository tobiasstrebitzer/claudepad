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
 * True when `text` is a link that resolves to an opaque share blob. Three shapes,
 * all registry-agnostic (no hardwired host):
 *  - an app link `…?share=<id>` (the redirect target - opens straight in the SPA),
 *  - a registry short link `…/s/<id>` (what we hand out; redirects to the app), or
 *  - a registry blob link `…/blobs/<id>` (a conformant registry's own URL).
 * Each routes to receive→fetch-by-id instead of the session parser.
 */
export function isShareLink(text: string): boolean {
  const t = text.trim()
  if (/\s/.test(t)) return false // a link is a single token, never a pasted session
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (u.searchParams.get('share')) return true
    return /\/(?:s|blobs)\/[^/]+\/?$/.test(u.pathname)
  } catch {
    return false
  }
}
