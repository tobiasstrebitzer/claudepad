import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Session } from '@claudepad/schema';
import { mintIdentity, encodePublicCard } from '@claudepad/shared';
import { scanSession, redact } from '@claudepad/secrets';
import { createShare, openShare } from '../src/share/blob';

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
