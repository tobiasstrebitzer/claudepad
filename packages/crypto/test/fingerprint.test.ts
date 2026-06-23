import { describe, it, expect } from 'vitest'
import { mintIdentity, fingerprint, createBlob, utf8ToBytes } from '../src/index'

describe('fingerprint', () => {
  it('is stable for the same key and differs across keys', async () => {
    const a = await mintIdentity('A')
    const b = await mintIdentity('B')
    const fa1 = await fingerprint(a.pub)
    const fa2 = await fingerprint(a.pub)
    const fb = await fingerprint(b.pub)
    expect(fa1).toEqual(fa2)
    expect(fa1.code).not.toBe(fb.code)
  })

  it('produces 6 emoji + an XXXX-XXXX code', async () => {
    const id = await mintIdentity('Toby')
    const fp = await fingerprint(id.pub)
    expect(fp.emoji.split(' ')).toHaveLength(6)
    expect(fp.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('recipient can verify the sender via the fingerprint in the blob', async () => {
    const toby = await mintIdentity('Toby')
    const steve = await mintIdentity('Steve')
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes('hi'),
      tier: 'body'
    })
    const fromBlob = await fingerprint(blob.from.pub)
    const ofToby = await fingerprint(toby.pub)
    expect(fromBlob.code).toBe(ofToby.code)
    expect(fromBlob.emoji).toBe(ofToby.emoji)
  })
})
