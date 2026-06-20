// Persist the granted directory handle across visits.
//
// A FileSystemDirectoryHandle is structured-cloneable, so it can live directly in
// IndexedDB. On a return visit we re-derive permission from it (see vault.ts) -
// the handle itself is the durable "connection", which is what makes a one-time
// connect possible. Nothing here reads session contents.

const DB_NAME = 'claudepad-vault';
const STORE = 'handles';
const ROOT_KEY = 'claude-projects-root';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
    });
  } finally {
    db.close();
  }
}

export function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<IDBValidKey> {
  return withStore('readwrite', (s) => s.put(handle, ROOT_KEY));
}

export function loadRootHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return withStore<FileSystemDirectoryHandle | undefined>('readonly', (s) =>
    s.get(ROOT_KEY),
  );
}

export function clearRootHandle(): Promise<undefined> {
  return withStore('readwrite', (s) => s.delete(ROOT_KEY));
}
