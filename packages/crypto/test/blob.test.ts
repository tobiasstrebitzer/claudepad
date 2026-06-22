import { describe, it, expect } from 'vitest';
import {
  mintIdentity,
  encodePublicCard,
  createBlob,
  createMultiBlob,
  openBlob,
  encodeBlob,
  decodeBlob,
  isMultiBlob,
  bytesToUtf8,
  utf8ToBytes,
  CryptoAuthError,
  CryptoFormatError,
} from '../src/index';

const BODY =
  'Assistant: Here is how to deploy.\nUser: thanks!\n[SECRET ••••(20)] used in step 3.';
const SECRETS = JSON.stringify({ S1: 'sk-live-51H9xExAmPlEtOkEnDoNoTuSe' });

describe('ShareBlob tiers', () => {
  it('body-only: recipient reads body, no secrets, blob.secret null, sees sender name', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body',
    });
    expect(blob.secret).toBeNull();

    const open = await openBlob({ me: steve, blob });
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
    expect(open.secretBytes).toBeNull();
    expect(open.from.name).toBe('Toby');
    expect(open.tier).toBe('body');
  });

  it('body+secret: recipient reads body and secrets', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    expect(blob.secret).not.toBeNull();

    const open = await openBlob({ me: steve, blob });
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
    expect(open.secretBytes).not.toBeNull();
    expect(bytesToUtf8(open.secretBytes!)).toBe(SECRETS);
  });

  it('accepts an encoded recipient card as well as a raw pub', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientCard: encodePublicCard(steve),
      bodyBytes: utf8ToBytes(BODY),
      tier: 'body',
    });
    const open = await openBlob({ me: steve, blob });
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
  });

  it('Eve (non-recipient) cannot open either blob -> CryptoAuthError', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const eve = await mintIdentity('Eve');
    const low = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      tier: 'body',
    });
    const hi = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    await expect(openBlob({ me: eve, blob: low })).rejects.toBeInstanceOf(
      CryptoAuthError,
    );
    await expect(openBlob({ me: eve, blob: hi })).rejects.toBeInstanceOf(CryptoAuthError);
  });

  it('serialized blob leaks no plaintext secret or body', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    const wire = encodeBlob(blob);
    expect(wire).not.toContain('sk-live');
    expect(wire).not.toContain('deploy');
    expect(decodeBlob(wire).from.name).toBe('Toby');
  });

  it('round-trips an empty body', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: new Uint8Array(0),
      tier: 'body',
    });
    const open = await openBlob({ me: steve, blob });
    expect(open.bodyBytes.length).toBe(0);
  });

  it('round-trips a large (~1MB) body', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const big = new Uint8Array(1_000_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 17) & 0xff;
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: big,
      tier: 'body',
    });
    const open = await openBlob({ me: steve, blob });
    expect(open.bodyBytes.length).toBe(big.length);
    expect(open.bodyBytes[0]).toBe(big[0]);
    expect(open.bodyBytes[big.length - 1]).toBe(big[big.length - 1]);
  });

  it('round-trips the serialized blob through decodeBlob -> openBlob', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createBlob({
      sender: toby,
      recipientPub: steve.pub,
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    const decoded = decodeBlob(encodeBlob(blob));
    const open = await openBlob({ me: steve, blob: decoded });
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
    expect(bytesToUtf8(open.secretBytes!)).toBe(SECRETS);
  });
});

describe('MultiShareBlob (multi-recipient, PRD-11 Q-14)', () => {
  it('every listed recipient can open it; an outsider cannot', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const alice = await mintIdentity('Alice');
    const eve = await mintIdentity('Eve');

    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientCard: encodePublicCard(alice) }],
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    expect(isMultiBlob(blob)).toBe(true);
    expect(blob.wraps).toHaveLength(2);

    for (const me of [steve, alice]) {
      const open = await openBlob({ me, blob });
      expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
      expect(bytesToUtf8(open.secretBytes!)).toBe(SECRETS);
      expect(open.from.name).toBe('Toby');
    }
    await expect(openBlob({ me: eve, blob })).rejects.toBeInstanceOf(CryptoAuthError);
  });

  it('body-only tier wraps no secret key; recipients get no secrets', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const alice = await mintIdentity('Alice');
    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientPub: alice.pub }],
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body',
    });
    expect(blob.secret).toBeNull();
    const open = await openBlob({ me: alice, blob });
    expect(open.secretBytes).toBeNull();
  });

  it('encrypts the payload once (shared content key) but wraps per recipient', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const alice = await mintIdentity('Alice');
    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientPub: alice.pub }],
      bodyBytes: utf8ToBytes(BODY),
      tier: 'body',
    });
    // Distinct ephemeral keys + wraps per recipient...
    expect(blob.wraps[0]!.eph).not.toBe(blob.wraps[1]!.eph);
    expect(blob.wraps[0]!.wrap.ct).not.toBe(blob.wraps[1]!.wrap.ct);
    // ...but both decrypt the same single body ciphertext.
    const a = await openBlob({ me: steve, blob });
    const b = await openBlob({ me: alice, blob });
    expect(bytesToUtf8(a.bodyBytes)).toBe(bytesToUtf8(b.bodyBytes));
  });

  it('dedupes a recipient added twice (no double wrap)', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientPub: steve.pub }],
      bodyBytes: utf8ToBytes(BODY),
      tier: 'body',
    });
    expect(blob.wraps).toHaveLength(1);
  });

  it('requires at least one recipient', async () => {
    const toby = await mintIdentity('Toby');
    await expect(
      createMultiBlob({ sender: toby, recipients: [], bodyBytes: utf8ToBytes(BODY), tier: 'body' }),
    ).rejects.toBeInstanceOf(CryptoFormatError);
  });

  it('round-trips through encode/decodeBlob and leaks no plaintext', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const alice = await mintIdentity('Alice');
    const blob = await createMultiBlob({
      sender: toby,
      recipients: [{ recipientPub: steve.pub }, { recipientPub: alice.pub }],
      bodyBytes: utf8ToBytes(BODY),
      secretBytes: utf8ToBytes(SECRETS),
      tier: 'body+secret',
    });
    const wire = encodeBlob(blob);
    expect(wire).not.toContain('sk-live');
    expect(wire).not.toContain('deploy');
    const decoded = decodeBlob(wire);
    expect(isMultiBlob(decoded)).toBe(true);
    const open = await openBlob({ me: alice, blob: decoded });
    expect(bytesToUtf8(open.bodyBytes)).toBe(BODY);
  });
});
