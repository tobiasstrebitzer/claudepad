// Local-only persistence for the user's identity (PRD-10 FR-6). A *single*
// identity lives in IndexedDB across reloads — either stored unprotected (the
// full secret, incl. the private JWK) or, once device-protected, with the secret
// AES-GCM-wrapped under a WebAuthn-PRF KEK so the private key is never readable
// at rest (FR-16). Mirrors the fs/handleStore IDB pattern; nothing leaves the
// browser (there is no network for identities — PRD-10 §8).

import type { Identity } from '@claudepad/shared';
import type { AesLayer } from '@claudepad/shared';

/** An identity stored unprotected — the secret, plus a discriminant. */
export type StoredUnprotected = Identity & { protected: false };

/** A device-protected identity at rest: only public fields + the wrapped secret. */
export interface StoredProtected {
  protected: true;
  v: 1;
  name: string;
  pub: string;
  /** base64url of the passkey's raw credential id, replayed on unlock. */
  credentialId: string;
  /** the identity secret, AES-GCM-encrypted under the device KEK. */
  wrapped: AesLayer;
}

export type StoredIdentity = StoredUnprotected | StoredProtected;

/**
 * The persistence seam. The default implementation is IndexedDB-backed; tests
 * inject an in-memory adapter so the state machine is exercised without a real
 * IndexedDB (jsdom has none) and without touching disk.
 */
export interface IdentityStorage {
  load(): Promise<StoredIdentity | undefined>;
  save(identity: StoredIdentity): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'claudepad-identity';
const STORE = 'identity';
const KEY = 'self';

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

/** The production IndexedDB-backed identity store. */
export const indexedDbStorage: IdentityStorage = {
  load: () =>
    withStore<StoredIdentity | undefined>('readonly', (s) => s.get(KEY)),
  save: (identity) =>
    withStore('readwrite', (s) => s.put(identity, KEY)).then(() => undefined),
  clear: () => withStore('readwrite', (s) => s.delete(KEY)).then(() => undefined),
};
