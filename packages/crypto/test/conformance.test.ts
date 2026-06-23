// Conformance anchor (ported from the retired poc/verify.mjs). Runs the proven
// trustless-share narrative - Toby shares with Steve, Eve is an outsider, Alice
// is a second recipient - end-to-end against the PRODUCTION crypto, so the
// scheme's guarantees are verified where they actually ship. The per-unit edge
// cases live in blob/fingerprint/device/errors tests; this is the integrated
// walkthrough an auditor can read as "the design, proven against production".

import { describe, it, expect, beforeAll } from 'vitest'
import {
  mintIdentity,
  encodePublicCard,
  createBlob,
  createMultiBlob,
  openBlob,
  encodeBlob,
  fingerprint,
  wrapIdentity,
  unwrapIdentity,
  randomBytes,
  utf8ToBytes,
  bytesToUtf8,
  type Identity
} from '../src/index'

const BODY =
  'Assistant: Here is how to deploy.\nUser: thanks!\n[SECRET ••••(20)] used in step 3.'
const SECRETS = JSON.stringify({ S1: 'sk-live-51H9xExAmPlEtOkEnDoNoTuSe' })

let toby: Identity
let steve: Identity
let eve: Identity

beforeAll(async () => {
  toby = await mintIdentity('Toby')
  steve = await mintIdentity('Steve')
  eve = await mintIdentity('Eve')
})

describe('conformance [1] body-only share', () => {
  it('recipient reads the body but receives no secrets, and the blob carries none', async () => {
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body'
    })
    const open = await openBlob({ me: steve, blob })
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY)
    expect(open.secretBytes).toBeNull()
    expect(blob.secret).toBeNull()
    expect(open.from.name).toBe('Toby')
  })
})

describe('conformance [2] body+secret share', () => {
  it('recipient reads the body and the secrets', async () => {
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret'
    })
    const open = await openBlob({ me: steve, blob })
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY)
    expect(bytesToUtf8(open.secretBytes!)).toBe(SECRETS)
  })
})

describe('conformance [3] a non-recipient is locked out', () => {
  it('Eve cannot decrypt either tier (AES-GCM auth fails on the wrong key)', async () => {
    for (const tier of ['body', 'body+secret'] as const) {
      const blob = await createBlob({
        sender: toby,
        recipientPub: steve.pub,
        bodyBytes: utf8ToBytes(BODY),
        secretBytes: utf8ToBytes(SECRETS),
        tier
      })
      await expect(openBlob({ me: eve, blob })).rejects.toThrow()
    }
  })
})

describe('conformance [4] the wire is opaque', () => {
  it('the serialized blob leaks no plaintext body or secret', async () => {
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret'
    })
    const wire = encodeBlob(blob)
    expect(wire).not.toContain('sk-live')
    expect(wire).not.toContain('deploy')
    expect(blob.from.name).toBe('Toby') // only the public, unverified sender name is clear
  })
})

describe('conformance [5] human-verifiable fingerprints', () => {
  it('are stable per key, differ across keys, and let a recipient verify the sender', async () => {
    const fpSteve1 = await fingerprint(steve.pub)
    const fpSteve2 = await fingerprint(steve.pub)
    const fpToby = await fingerprint(toby.pub)
    expect(fpSteve1).toEqual(fpSteve2)
    expect(fpSteve1.code).not.toBe(fpToby.code)

    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      tier: 'body'
    })
    expect((await fingerprint(blob.from.pub)).code).toBe(fpToby.code)
  })
})

describe('conformance [6] device-key protection (PRF -> KEK wraps the identity)', () => {
  it('hides the private scalar, unwraps with the same PRF, and fails with a different one', async () => {
    const prf = randomBytes(32)
    const wrapped = await wrapIdentity(steve, prf)
    expect(JSON.stringify(wrapped)).not.toContain(steve.priv.d!)

    const recovered = await unwrapIdentity(wrapped, prf)
    expect(recovered.pub).toBe(steve.pub)
    expect(recovered.priv.d).toBe(steve.priv.d)

    await expect(unwrapIdentity(wrapped, randomBytes(32))).rejects.toThrow()
  })
})

describe('conformance [7] one blob to many recipients', () => {
  it('encrypts the payload once, wraps per recipient, and excludes outsiders', async () => {
    const alice = await mintIdentity('Alice')
    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientCard: encodePublicCard(alice) }],
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret'
    })
    expect(blob.wraps).toHaveLength(2) // recipient count is visible by design

    for (const me of [steve, alice]) {
      const open = await openBlob({ me, blob })
      expect(bytesToUtf8(open.bodyBytes)).toBe(BODY)
      expect(bytesToUtf8(open.secretBytes!)).toBe(SECRETS)
    }
    await expect(openBlob({ me: eve, blob })).rejects.toThrow()

    const wire = encodeBlob(blob)
    expect(wire).not.toContain('sk-live')
    expect(wire).not.toContain('deploy')
  })
})
