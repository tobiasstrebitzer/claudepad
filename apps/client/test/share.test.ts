import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Session } from '@/schema';
import { mintIdentity, encodePublicCard } from '@claudepad/crypto';
import { scanSession, redact } from '@/secrets';
import { createShare, openShare } from '../src/share/blob';
import { isShareBlob, isShareLink } from '../src/share/detect';

const AWS = 'AKIAIOSFODNN7EXAMPLE';

function session(): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: { title: 'Deploy' },
    events: [{ kind: 'user', id: 'u1', content: [{ type: 'text', text: `key ${AWS} here` }] }],
  };
}

function redacted() {
  const s = session();
  return redact(s, scanSession(s));
}

describe('trustless share round-trip (PRD-11)', () => {
  it('body+secret: recipient reads the body and the secrets (FR-10)', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const { body, secretMap } = redacted();

    const blob = await createShare({
      sender: toby,
      recipientCard: encodePublicCard(steve),
      body,
      secretMap,
      tier: 'body+secret',
    });
    expect(blob.startsWith('cp-blob-')).toBe(true);

    const opened = await openShare(steve, blob);
    expect(opened.from.name).toBe('Toby');
    expect(opened.tier).toBe('body+secret');
    expect(opened.session.meta.title).toBe('Deploy');
    // The secret map carries the real value; the body never does.
    expect(Object.values(opened.secretMap!).some((e) => e.value === AWS)).toBe(true);
    expect(JSON.stringify(opened.session)).not.toContain(AWS);
  });

  it('body-only: the blob carries no secret ciphertext at all (FR-14)', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const { body, secretMap } = redacted();

    const blob = await createShare({
      sender: toby,
      recipientCard: encodePublicCard(steve),
      body,
      secretMap,
      tier: 'body',
    });
    const opened = await openShare(steve, blob);
    expect(opened.tier).toBe('body');
    expect(opened.secretMap).toBeNull();
    // No secret value anywhere in the wire form.
    expect(blob).not.toContain(AWS);
  });

  it('fails closed for a non-recipient - no partial render (FR-11)', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const eve = await mintIdentity('Eve');
    const { body, secretMap } = redacted();

    const blob = await createShare({
      sender: toby,
      recipientCard: encodePublicCard(steve),
      body,
      secretMap,
      tier: 'body+secret',
    });
    await expect(openShare(eve, blob)).rejects.toBeTruthy();
  });

  it('rejects a corrupt / unsupported blob (FR-15)', async () => {
    const me = await mintIdentity('Toby');
    await expect(openShare(me, 'cp-blob-not-valid')).rejects.toBeTruthy();
  });
});

describe('home-surface sniffing (routes a registry short link to receive)', () => {
  it('isShareLink matches a https /blobs/<id> URL', () => {
    expect(isShareLink('https://registry.claudepad.io/blobs/8ca1c2ae-6c96-49b3')).toBe(true);
    expect(isShareLink('  https://r.example.com/blobs/abc123  ')).toBe(true);
    expect(isShareLink('http://localhost:8787/blobs/xyz')).toBe(true);
  });

  it('isShareLink rejects non-links and non-blob URLs', () => {
    expect(isShareLink('cp-blob-abc')).toBe(false); // an inline blob, not a link
    expect(isShareLink('https://registry.claudepad.io/directory/dana')).toBe(false);
    expect(isShareLink('https://example.com')).toBe(false);
    expect(isShareLink('{"some":"jsonl"}\n{"line":2}')).toBe(false); // a pasted session
    expect(isShareLink('not a url at all')).toBe(false);
  });

  it('a short link is not mistaken for an inline blob, and vice-versa', () => {
    const link = 'https://registry.claudepad.io/blobs/abc';
    expect(isShareLink(link)).toBe(true);
    expect(isShareBlob(link)).toBe(false);
    expect(isShareBlob('cp-blob-xyz')).toBe(true);
    expect(isShareLink('cp-blob-xyz')).toBe(false);
  });
});

describe('no network egress (FR-17)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('share + receive never call fetch', async () => {
    const toby = await mintIdentity('Toby');
    const steve = await mintIdentity('Steve');
    const { body, secretMap } = redacted();
    const blob = await createShare({
      sender: toby,
      recipientCard: encodePublicCard(steve),
      body,
      secretMap,
      tier: 'body+secret',
    });
    await openShare(steve, blob);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
