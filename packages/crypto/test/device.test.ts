import { describe, it, expect } from 'vitest'
import {
  mintIdentity,
  wrapIdentity,
  unwrapIdentity,
  randomBytes,
  CryptoAuthError
} from '../src/index'

describe('device protection (pattern A)', () => {
  it('wrapped identity does not expose the private scalar priv.d', async () => {
    const id = await mintIdentity('Steve')
    const prf = randomBytes(32)
    const wrapped = await wrapIdentity(id, prf)
    expect(id.priv.d).toBeTruthy()
    expect(JSON.stringify(wrapped)).not.toContain(id.priv.d!)
  })

  it('unwraps with the same PRF secret', async () => {
    const id = await mintIdentity('Steve')
    const prf = randomBytes(32)
    const wrapped = await wrapIdentity(id, prf)
    const recovered = await unwrapIdentity(wrapped, prf)
    expect(recovered.pub).toBe(id.pub)
    expect(recovered.priv.d).toBe(id.priv.d)
    expect(recovered.name).toBe('Steve')
  })

  it('fails (CryptoAuthError) with a different PRF secret', async () => {
    const id = await mintIdentity('Steve')
    const wrapped = await wrapIdentity(id, randomBytes(32))
    await expect(unwrapIdentity(wrapped, randomBytes(32))).rejects.toBeInstanceOf(
      CryptoAuthError
    )
  })
})
