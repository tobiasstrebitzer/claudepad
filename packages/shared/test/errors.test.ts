import { describe, it, expect } from 'vitest';
import {
  mintIdentity,
  generateContentKey,
  aesEncrypt,
  aesDecrypt,
  createBlob,
  openBlob,
  decodeBlob,
  decodePublicCard,
  decodeIdentitySecret,
  utf8ToBytes,
  CryptoAuthError,
  CryptoFormatError,
  CryptoVersionError,
} from '../src/index';

describe('robustness / typed errors', () => {
  it('tampered ciphertext -> CryptoAuthError', async () => {
    const { key } = await generateContentKey();
    const layer = await aesEncrypt(key, utf8ToBytes('hello world'));
    const tampered = {
      iv: layer.iv,
      ct: layer.ct.slice(0, -2) + (layer.ct.endsWith('A') ? 'B' : 'A'),
    };
    await expect(aesDecrypt(key, tampered)).rejects.toBeInstanceOf(CryptoAuthError);
  });

  it('wrong key -> CryptoAuthError', async () => {
    const a = await generateContentKey();
    const b = await generateContentKey();
    const layer = await aesEncrypt(a.key, utf8ToBytes('secret'));
    await expect(aesDecrypt(b.key, layer)).rejects.toBeInstanceOf(CryptoAuthError);
  });

  it('tampered blob body -> CryptoAuthError on open', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes('payload'),
      tier: 'body',
    });
    blob.body.ct = blob.body.ct.slice(0, -2) + (blob.body.ct.endsWith('A') ? 'B' : 'A');
    await expect(openBlob({ me: steve, blob })).rejects.toBeInstanceOf(CryptoAuthError);
  });

  it('malformed base64url in public card -> CryptoFormatError', () => {
    expect(() => decodePublicCard('not base64url !!!')).toThrow(CryptoFormatError);
  });

  it('malformed JSON blob -> CryptoFormatError', () => {
    expect(() => decodeBlob('{ not json')).toThrow(CryptoFormatError);
  });

  it('wrong-version blob -> CryptoVersionError', () => {
    expect(() => decodeBlob(JSON.stringify({ v: 2 }))).toThrow(CryptoVersionError);
  });

  it('wrong-version public card -> CryptoVersionError', () => {
    // base64url(JSON{ v: 99, name, pub })
    const bad = decodePublicCardFixture();
    expect(() => decodePublicCard(bad)).toThrow(CryptoVersionError);
  });

  it('malformed identity secret -> CryptoFormatError', () => {
    expect(() => decodeIdentitySecret('@@@@')).toThrow(CryptoFormatError);
  });
});

function decodePublicCardFixture(): string {
  const json = JSON.stringify({ v: 99, name: 'X', pub: 'AAAA' });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
