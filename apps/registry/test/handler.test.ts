import { describe, expect, it, beforeEach } from 'vitest';
import { encodePublicCard, mintIdentity, type Identity } from '@claudepad/crypto';
import type { RegistryManifest } from '@claudepad/registry-spec';
import { createRegistryHandler, InMemoryBackend } from '../src/index';

const BASE = 'https://r.test';

function zkManifest(overrides: Partial<RegistryManifest> = {}): RegistryManifest {
  return {
    id: 'r',
    name: 'R',
    baseUrl: BASE,
    tls: 'required',
    modes: ['zero-knowledge'],
    directory: { enabled: true, assurance: ['self'] },
    store: { expiry: true, burnAfterRead: true, delete: true },
    ...overrides,
  };
}

function makeHandler(manifest: RegistryManifest, now: () => number = () => 1000) {
  let n = 0;
  return createRegistryHandler(new InMemoryBackend(), {
    manifest,
    generateId: () => `id${++n}`,
    now,
  });
}

function bearer(id: string): Record<string, string> {
  return { authorization: `Bearer ${id}` };
}

describe('manifest + openapi', () => {
  it('serves the manifest and openapi doc', async () => {
    const h = makeHandler(zkManifest());
    const m = await h(new Request(`${BASE}/.well-known/claudepad-registry`));
    expect(m.status).toBe(200);
    expect((await m.json()).id).toBe('r');

    const o = await h(new Request(`${BASE}/openapi.json`));
    expect(o.status).toBe(200);
    expect((await o.json()).openapi).toBe('3.1.0');
  });
});

describe('zero-knowledge blobs', () => {
  it('round-trips opaque bytes', async () => {
    const h = makeHandler(zkManifest());
    const bytes = new Uint8Array([1, 2, 3, 255, 0, 42]);
    const put = await h(new Request(`${BASE}/blobs`, { method: 'POST', body: bytes }));
    expect(put.status).toBe(201);
    const { id, url } = await put.json();
    expect(id).toBe('id1');
    expect(url).toBe(`${BASE}/blobs/id1`);

    const get = await h(new Request(`${BASE}/blobs/id1`));
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
  });

  it('404s an unknown blob and deletes by id', async () => {
    const h = makeHandler(zkManifest());
    expect((await h(new Request(`${BASE}/blobs/nope`))).status).toBe(404);

    await h(new Request(`${BASE}/blobs`, { method: 'POST', body: new Uint8Array([9]) }));
    const del = await h(new Request(`${BASE}/blobs/id1`, { method: 'DELETE' }));
    expect(del.status).toBe(204);
    expect((await h(new Request(`${BASE}/blobs/id1`))).status).toBe(404);
  });

  it('burns after read', async () => {
    const h = makeHandler(zkManifest());
    await h(new Request(`${BASE}/blobs?burnAfterRead=true`, { method: 'POST', body: new Uint8Array([7]) }));
    expect((await h(new Request(`${BASE}/blobs/id1`))).status).toBe(200);
    expect((await h(new Request(`${BASE}/blobs/id1`))).status).toBe(404);
  });

  it('expires and returns gone', async () => {
    let clock = 1000;
    const h = makeHandler(zkManifest(), () => clock);
    await h(new Request(`${BASE}/blobs?expiresInSeconds=10`, { method: 'POST', body: new Uint8Array([1]) }));
    clock = 1000 + 11_000;
    expect((await h(new Request(`${BASE}/blobs/id1`))).status).toBe(410);
  });

  it('rejects oversize blobs', async () => {
    const h = makeHandler(zkManifest({ store: { expiry: true, burnAfterRead: true, delete: true, maxBytes: 2 } }));
    const put = await h(new Request(`${BASE}/blobs`, { method: 'POST', body: new Uint8Array([1, 2, 3]) }));
    expect(put.status).toBe(413);
  });
});

describe('inbox (opt-in index)', () => {
  it('lists ids addressed to the authenticated key, requires auth', async () => {
    const h = makeHandler(zkManifest());
    await h(
      new Request(`${BASE}/blobs`, {
        method: 'POST',
        body: new Uint8Array([1]),
        headers: { 'x-claudepad-index-for': 'alicehash, bobhash' },
      }),
    );
    expect((await h(new Request(`${BASE}/inbox`))).status).toBe(401);

    const inbox = await h(new Request(`${BASE}/inbox`, { headers: bearer('alicehash') }));
    expect(inbox.status).toBe(200);
    expect((await inbox.json()).ids).toEqual(['id1']);

    const empty = await h(new Request(`${BASE}/inbox`, { headers: bearer('carolhash') }));
    expect((await empty.json()).ids).toEqual([]);
  });
});

describe('trusted-mode sessions', () => {
  it('rejects readable sessions on a ZK-only registry', async () => {
    const h = makeHandler(zkManifest());
    const r = await h(
      new Request(`${BASE}/sessions`, { method: 'POST', body: '{}', headers: bearer('a') }),
    );
    expect(r.status).toBe(422);
  });

  it('stores and serves a readable session to its owner only', async () => {
    const h = makeHandler(zkManifest({ modes: ['zero-knowledge', 'trusted'] }));
    const put = await h(
      new Request(`${BASE}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ title: 'hi' }),
        headers: bearer('alice'),
      }),
    );
    expect(put.status).toBe(201);
    const { id } = await put.json();

    const mine = await h(new Request(`${BASE}/sessions/${id}`, { headers: bearer('alice') }));
    expect(mine.status).toBe(200);
    expect((await mine.json()).title).toBe('hi');

    const theirs = await h(new Request(`${BASE}/sessions/${id}`, { headers: bearer('bob') }));
    expect(theirs.status).toBe(403);

    const anon = await h(new Request(`${BASE}/sessions/${id}`));
    expect(anon.status).toBe(401);
  });
});

describe('identity directory', () => {
  let alice: Identity;
  beforeEach(async () => {
    alice = await mintIdentity('Alice');
  });

  it('publishes (deriving fingerprint + self assurance), resolves, searches, revokes', async () => {
    const h = makeHandler(zkManifest());
    const card = `cp-pub-${encodePublicCard(alice)}`;

    const pub = await h(
      new Request(`${BASE}/directory`, {
        method: 'POST',
        body: JSON.stringify({ card, handle: 'alice@acme', assurance: 'sso' }),
        headers: bearer('alicekey'),
      }),
    );
    expect(pub.status).toBe(201);
    const entry = await pub.json();
    expect(entry.handle).toBe('alice@acme');
    expect(entry.assurance).toBe('self'); // reference impl has no verifier -> downgrade
    expect(entry.fingerprint).toMatch(/[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(entry.pub).toBe(alice.pub);

    const resolved = await h(new Request(`${BASE}/directory/alice%40acme`));
    expect(resolved.status).toBe(200);
    expect((await resolved.json()).handle).toBe('alice@acme');

    const search = await h(new Request(`${BASE}/directory?q=alice`));
    expect((await search.json()).entries).toHaveLength(1);

    const revoke = await h(
      new Request(`${BASE}/directory/alice%40acme`, { method: 'DELETE', headers: bearer('alicekey') }),
    );
    expect(revoke.status).toBe(204);
    expect((await h(new Request(`${BASE}/directory/alice%40acme`))).status).toBe(404);
  });

  it('blocks claiming a handle owned by another key (conflict) and revoke by non-owner', async () => {
    const h = makeHandler(zkManifest());
    const card = `cp-pub-${encodePublicCard(alice)}`;
    await h(
      new Request(`${BASE}/directory`, {
        method: 'POST',
        body: JSON.stringify({ card, handle: 'shared' }),
        headers: bearer('alicekey'),
      }),
    );
    const conflict = await h(
      new Request(`${BASE}/directory`, {
        method: 'POST',
        body: JSON.stringify({ card, handle: 'shared' }),
        headers: bearer('mallorykey'),
      }),
    );
    expect(conflict.status).toBe(409);

    const badRevoke = await h(
      new Request(`${BASE}/directory/shared`, { method: 'DELETE', headers: bearer('mallorykey') }),
    );
    expect(badRevoke.status).toBe(403);
  });

  it('rejects a malformed card', async () => {
    const h = makeHandler(zkManifest());
    const r = await h(
      new Request(`${BASE}/directory`, {
        method: 'POST',
        body: JSON.stringify({ card: 'cp-pub-not-base64-json' }),
        headers: bearer('k'),
      }),
    );
    expect(r.status).toBe(400);
  });

  it('directory_disabled when the registry has no directory', async () => {
    const h = makeHandler(zkManifest({ directory: undefined }));
    expect((await h(new Request(`${BASE}/directory?q=x`))).status).toBe(404);
  });
});

describe('unknown routes', () => {
  it('404s', async () => {
    const h = makeHandler(zkManifest());
    expect((await h(new Request(`${BASE}/nope`))).status).toBe(404);
  });
});
