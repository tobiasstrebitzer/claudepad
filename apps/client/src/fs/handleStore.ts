// Persist the granted directory handle across visits.
//
// A FileSystemDirectoryHandle is structured-cloneable, so it can live directly in
// IndexedDB. On a return visit we re-derive permission from it (see vault.ts) -
// the handle itself is the durable "connection", which is what makes a one-time
// connect possible. Nothing here reads session contents.

import { createIdbKv } from '../lib/idbKv'

const ROOT_KEY = 'claude-projects-root'
const kv = createIdbKv('claudepad-vault', 'handles')

export function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return kv.set(ROOT_KEY, handle)
}

export function loadRootHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return kv.get<FileSystemDirectoryHandle>(ROOT_KEY)
}

export function clearRootHandle(): Promise<void> {
  return kv.delete(ROOT_KEY)
}
