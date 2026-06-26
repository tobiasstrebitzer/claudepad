// A tiny IndexedDB key-value store: one object store, get/set/delete by key.
// Both fs/handleStore (the granted directory handle) and identity/storage (the
// single identity record) persist exactly one record this way.

export interface IdbKv {
  get<T>(key: IDBValidKey): Promise<T | undefined>
  set(key: IDBValidKey, value: unknown): Promise<void>
  delete(key: IDBValidKey): Promise<void>
}

export function createIdbKv(dbName: string, storeName: string): IdbKv {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(storeName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB.'))
    })
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await openDb()
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(storeName, mode).objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'))
      })
    } finally {
      db.close()
    }
  }

  return {
    get: <T>(key: IDBValidKey) =>
      withStore<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
    set: (key, value) =>
      withStore('readwrite', (s) => s.put(value, key)).then(() => undefined),
    delete: (key) =>
      withStore('readwrite', (s) => s.delete(key)).then(() => undefined)
  }
}
