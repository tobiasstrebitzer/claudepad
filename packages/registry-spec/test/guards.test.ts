import { describe, expect, it } from 'vitest'
import {
  assertAllowedRegistryUrl,
  isAllowedRegistryUrl,
  parseManifest,
  RegistryError,
  type RegistryManifest
} from '../src/index'

describe('isAllowedRegistryUrl (D-77: TLS mandatory)', () => {
  it('accepts https to any host', () => {
    expect(isAllowedRegistryUrl('https://registry.example.com')).toBe(true)
    expect(isAllowedRegistryUrl('https://claudepad.io/registry')).toBe(true)
  })

  it('accepts http only on localhost (dev)', () => {
    expect(isAllowedRegistryUrl('http://localhost:8787')).toBe(true)
    expect(isAllowedRegistryUrl('http://127.0.0.1:8787')).toBe(true)
  })

  it('rejects plaintext http to a real host', () => {
    expect(isAllowedRegistryUrl('http://registry.example.com')).toBe(false)
    expect(isAllowedRegistryUrl('http://evil.test')).toBe(false)
  })

  it('rejects non-http(s) schemes and garbage', () => {
    expect(isAllowedRegistryUrl('ws://localhost')).toBe(false)
    expect(isAllowedRegistryUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedRegistryUrl('not a url')).toBe(false)
    expect(isAllowedRegistryUrl('')).toBe(false)
  })

  it('assertAllowedRegistryUrl throws tls_required for non-TLS', () => {
    expect(() => assertAllowedRegistryUrl('http://registry.example.com')).toThrowError(
      RegistryError
    )
    try {
      assertAllowedRegistryUrl('http://registry.example.com')
    } catch (e) {
      expect((e as RegistryError).code).toBe('tls_required')
      expect((e as RegistryError).status).toBe(400)
    }
    expect(() => assertAllowedRegistryUrl('https://ok.example.com')).not.toThrow()
  })
})

describe('parseManifest (tolerant, fails closed on TLS invariants)', () => {
  const valid: RegistryManifest = {
    id: 'acme-internal',
    name: 'Acme Internal',
    baseUrl: 'https://registry.acme.com',
    tls: 'required',
    modes: ['zero-knowledge', 'trusted'],
    directory: { enabled: true, assurance: ['sso'], verifiedBy: 'acme.com' },
    store: { expiry: true, burnAfterRead: false, delete: true }
  }

  it('passes a valid manifest through and preserves extra fields', () => {
    const withExtra = { ...valid, futureField: 42 }
    const parsed = parseManifest(withExtra)
    expect(parsed.id).toBe('acme-internal')
    expect(parsed.modes).toEqual(['zero-knowledge', 'trusted'])
    expect((parsed as Record<string, unknown>)['futureField']).toBe(42)
  })

  it('drops unknown modes but keeps known ones', () => {
    const parsed = parseManifest({ ...valid, modes: ['zero-knowledge', 'quantum'] })
    expect(parsed.modes).toEqual(['zero-knowledge'])
  })

  it('rejects a manifest without tls: required', () => {
    expect(() => parseManifest({ ...valid, tls: 'optional' })).toThrowError(/tls/i)
  })

  it('rejects a non-https baseUrl', () => {
    expect(() => parseManifest({ ...valid, baseUrl: 'http://registry.acme.com' })).toThrowError(
      RegistryError
    )
  })

  it('rejects a manifest with no known modes', () => {
    expect(() => parseManifest({ ...valid, modes: ['quantum'] })).toThrowError(/mode/i)
  })

  it('rejects non-objects', () => {
    expect(() => parseManifest(null)).toThrowError(RegistryError)
    expect(() => parseManifest('nope')).toThrowError(RegistryError)
  })
})
