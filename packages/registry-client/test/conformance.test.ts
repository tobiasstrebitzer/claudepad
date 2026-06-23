import { describe, expect, it } from 'vitest'
import { createRegistryHandler, InMemoryBackend } from '@claudepad/registry'
import { encodePublicCard, mintIdentity } from '@claudepad/crypto'
import type { RegistryManifest } from '@claudepad/registry-spec'
import { RegistryClient, RegistryError, type FetchLike } from '../src/index'

const BASE = 'https://r.test'

const MANIFEST: RegistryManifest = {
  id: 'conformance',
  name: 'Conformance Registry',
  baseUrl: BASE,
  tls: 'required',
  modes: ['zero-knowledge', 'trusted'],
  directory: { enabled: true, assurance: ['self'] },
  store: { expiry: true, burnAfterRead: true, delete: true }
}

/** Bridge the SDK's fetch to the reference handler (no network). */
function handlerFetch(manifest: RegistryManifest = MANIFEST): FetchLike {
  let n = 0
  const handler = createRegistryHandler(new InMemoryBackend(), {
    manifest,
    generateId: () => `id${++n}`,
    now: () => 1000
  })
  return (input, init) =>
    handler(input instanceof Request ? input : new Request(input, init))
}

function client(fetchImpl: FetchLike, token: string | null = 'alicekey'): RegistryClient {
  return new RegistryClient(MANIFEST, { fetch: fetchImpl, getAuthToken: () => token })
}

describe('RegistryClient conformance against the reference impl', () => {
  it('connect() fetches + validates the manifest', async () => {
    const c = await RegistryClient.connect(BASE, { fetch: handlerFetch() })
    expect(c.id).toBe('conformance')
    expect(c.capabilities.delete).toBe(true)
  })

  it('round-trips an opaque blob', async () => {
    const c = client(handlerFetch())
    const bytes = new Uint8Array([0, 1, 2, 250, 99])
    const ref = await c.put(bytes)
    expect(ref.id).toBe('id1')
    expect(ref.url).toBe(`${BASE}/blobs/id1`)
    const back = await c.get('id1')
    expect(back).toEqual(bytes)
  })

  it('maps a missing blob to a typed not_found error', async () => {
    const c = client(handlerFetch())
    await expect(c.get('missing')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('publishes, resolves, searches, and revokes a directory entry', async () => {
    const fetchImpl = handlerFetch()
    const c = client(fetchImpl)
    const alice = await mintIdentity('Alice')
    const card = `cp-pub-${encodePublicCard(alice)}`

    const entry = await c.publishIdentity(card, { handle: 'alice@acme' })
    expect(entry.handle).toBe('alice@acme')
    expect(entry.assurance).toBe('self')
    expect(entry.pub).toBe(alice.pub)

    expect(await c.resolve('alice@acme')).toMatchObject({ handle: 'alice@acme' })
    expect(await c.resolve('ghost')).toBeNull()
    expect(await c.lookup('alice')).toHaveLength(1)

    await c.revokeIdentity('alice@acme')
    expect(await c.resolve('alice@acme')).toBeNull()
  })

  it('round-trips a trusted-mode session for its owner', async () => {
    const c = client(handlerFetch())
    const ref = await c.putSession({ title: 'demo', n: 7 })
    const back = (await c.getSession(ref.id)) as { title: string; n: number }
    expect(back.title).toBe('demo')
    expect(back.n).toBe(7)
  })

  it('lists the inbox by the authenticated key', async () => {
    const fetchImpl = handlerFetch()
    const c = client(fetchImpl, 'alicekey')
    await c.put(new Uint8Array([1]), { indexFor: ['alicekey', 'bobkey'] })
    expect(await c.inbox()).toEqual(['id1'])
  })

  it('throws unauthorized locally when an authed route has no token', async () => {
    const c = client(handlerFetch(), null)
    await expect(c.inbox()).rejects.toMatchObject({ code: 'unauthorized' })
  })
})

describe('TLS guard (D-77)', () => {
  it('refuses to connect to a non-https registry before any fetch', async () => {
    await expect(
      RegistryClient.connect('http://evil.test', { fetch: handlerFetch() })
    ).rejects.toMatchObject({ code: 'tls_required' })
  })

  it('refuses to construct against an http baseUrl', () => {
    expect(() => new RegistryClient({ ...MANIFEST, baseUrl: 'http://evil.test' })).toThrowError(
      RegistryError
    )
  })

  it('allows http on localhost (dev)', () => {
    expect(
      () => new RegistryClient({ ...MANIFEST, baseUrl: 'http://localhost:8787' })
    ).not.toThrow()
  })
})
