// Zero-dependency blob sniffing so the ingest surface can tell an encrypted share
// (`cp-blob-…`) apart from a raw `.jsonl` session and route it to decrypt instead
// of the parser. Kept import-free on purpose: useSession imports this without
// pulling in the crypto/UI of the rest of share/**.

export const CP_BLOB_PREFIX = 'cp-blob-';

/** True when `text` looks like a serialized trustless share (a `cp-blob-…`). */
export function isShareBlob(text: string): boolean {
  return text.trimStart().startsWith(CP_BLOB_PREFIX);
}
