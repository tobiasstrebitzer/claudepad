import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { fingerprint } from '@claudepad/crypto';
import { useIdentity } from '../src/identity/useIdentity';
import type { IdentityStorage, StoredIdentity } from '../src/identity/storage';

// In-memory storage so the none/locked/unlocked machine is exercised without a
// real IndexedDB (jsdom has none) - this is exactly why the storage is injectable.
function memoryStorage(seed?: StoredIdentity): IdentityStorage & { current?: StoredIdentity } {
  const box: { current?: StoredIdentity } = { current: seed };
  return {
    current: box.current,
    load: () => Promise.resolve(box.current),
    save: (id) => {
      box.current = id;
      return Promise.resolve();
    },
    clear: () => {
      box.current = undefined;
      return Promise.resolve();
    },
    get [Symbol.toStringTag]() {
      return 'memoryStorage';
    },
  } as IdentityStorage & { current?: StoredIdentity };
}

async function ready(storage: IdentityStorage) {
  const view = renderHook(() => useIdentity(storage));
  await waitFor(() => expect(view.result.current.state.status).not.toBe('loading'));
  return view;
}

describe('identity state machine (PRD-10 §4.1)', () => {
  let store: IdentityStorage;
  beforeEach(() => {
    store = memoryStorage();
  });

  it('starts at "none" with empty storage', async () => {
    const { result } = await ready(store);
    expect(result.current.state.status).toBe('none');
  });

  it('mint → unlocked, unprotected, persisted', async () => {
    const { result } = await ready(store);
    await act(async () => result.current.mint('Toby'));
    const s = result.current.state;
    expect(s.status).toBe('unlocked');
    if (s.status !== 'unlocked') throw new Error('not unlocked');
    expect(s.protected).toBe(false);
    expect(s.identity.name).toBe('Toby');
    // Persisted: a fresh hook over the same storage comes back unlocked.
    const again = await ready(store);
    expect(again.result.current.state.status).toBe('unlocked');
  });

  it('blank name defaults to anon (FR-1)', async () => {
    const { result } = await ready(store);
    await act(async () => result.current.mint('   '));
    const s = result.current.state;
    if (s.status !== 'unlocked') throw new Error('not unlocked');
    expect(s.identity.name).toBe('anon');
  });

  it('public card / secret carry the cp-pub- / cp-id- prefixes (FR-2/FR-3)', async () => {
    const { result } = await ready(store);
    await act(async () => result.current.mint('Toby'));
    expect(result.current.publicCard()).toMatch(/^cp-pub-/);
    expect(result.current.exportSecret()).toMatch(/^cp-id-/);
  });

  it('export → import round-trips into a fresh browser (FR-4)', async () => {
    const a = await ready(memoryStorage());
    await act(async () => a.result.current.mint('Toby'));
    const secret = a.result.current.exportSecret()!;
    const pubA = a.result.current.state.status === 'unlocked' ? a.result.current.state.identity.pub : '';

    const b = await ready(memoryStorage());
    await act(async () => b.result.current.importSecret(secret));
    const s = b.result.current.state;
    if (s.status !== 'unlocked') throw new Error('import failed');
    expect(s.identity.name).toBe('Toby');
    expect(s.identity.pub).toBe(pubA);
  });

  it('rejects a corrupt cp-id- string (FR-21)', async () => {
    const { result } = await ready(store);
    await expect(result.current.importSecret('cp-id-not-base64url!!')).rejects.toBeTruthy();
    expect(result.current.state.status).toBe('none');
  });

  it('sign out of an unprotected identity removes it (FR-8)', async () => {
    const { result } = await ready(store);
    await act(async () => result.current.mint('Toby'));
    await act(async () => result.current.signOut());
    expect(result.current.state.status).toBe('none');
    expect(await store.load()).toBeUndefined();
  });

  it('forget clears storage and returns to none (FR-9)', async () => {
    const { result } = await ready(store);
    await act(async () => result.current.mint('Toby'));
    await act(async () => result.current.forget());
    expect(result.current.state.status).toBe('none');
    expect(await store.load()).toBeUndefined();
  });

  it('a protected stored identity loads as "locked", never exposing the key (FR-7)', async () => {
    const seeded = memoryStorage({
      protected: true,
      v: 1,
      name: 'Toby',
      pub: 'AAAA',
      credentialId: 'BBBB',
      wrapped: { iv: 'CC', ct: 'DD' },
    });
    const { result } = await ready(seeded);
    const s = result.current.state;
    expect(s.status).toBe('locked');
    expect(JSON.stringify(s)).not.toContain('priv');
  });
});

// Sanity: the client-side fingerprint matches the shared crypto exactly (FR-10).
describe('fingerprint', () => {
  it('is stable and 6-emoji + XXXX-XXXX', async () => {
    const { emoji, code } = await fingerprint('AAAA');
    expect(emoji.split(' ')).toHaveLength(6);
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});
