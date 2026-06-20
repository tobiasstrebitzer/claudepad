// The v1 ShareBlob - an ephemeral sealed box, encrypted to one recipient's public key.
// This is the live v1 artifact (TRUSTLESS-MODEL §3, PRD-05 §6.10), NOT the vNext
// link-store ShareEnvelope. Mirrors poc/verify.mjs `createBlob` / `openBlob` exactly.

import { bytesToB64url, b64urlToBytes, utf8ToBytes, bytesToUtf8 } from './base64url';
import {
  aesEncrypt,
  aesDecrypt,
  generateContentKey,
  importContentKey,
  deriveWrappingKey,
  ECDH,
  type AesLayer,
} from './primitives';
import {
  type Identity,
  type PublicCard,
  decodePublicCard,
  importPrivateKey,
  importPublicKey,
} from './identity';
import { CryptoFormatError, CryptoVersionError, CryptoAuthError } from './errors';

const subtle = globalThis.crypto.subtle;

/** Whether a blob carries only the body, or the body and its secret map. */
export type Tier = 'body' | 'body+secret';

const ALG = 'ECDH-P256+HKDF-SHA256+AES-256-GCM' as const;

/** The self-contained, recipient-wrapped share artifact. Contains no plaintext. */
export interface ShareBlob {
  v: 1;
  alg: typeof ALG;
  eph: string; // ephemeral public key (raw, base64url)
  from: { name: string; pub: string }; // sender's public card (informational, unsigned)
  tier: Tier;
  wrap: AesLayer; // AES-GCM(KW, JSON{ kb, ks? })
  body: AesLayer; // AES-GCM(K_body, transcript)
  secret: AesLayer | null; // AES-GCM(K_secret, secretMap) | null
}

/** What the wrap layer carries: independent content keys (base64url raw). */
interface WrapObj {
  kb: string;
  ks?: string;
}

export interface CreateBlobOpts {
  sender: Identity | PublicCard;
  /** Recipient raw public key (base64url). Provide this OR `recipientCard`. */
  recipientPub?: string;
  /** Recipient encoded public card (base64url(JSON)). Provide this OR `recipientPub`. */
  recipientCard?: string;
  bodyBytes: Uint8Array;
  /** Only wrapped when tier is 'body+secret'. */
  secretBytes?: Uint8Array;
  tier: Tier;
}

/**
 * Build a per-recipient sealed box. A fresh ephemeral ECDH keypair is generated per
 * share (forward-secret, unlinkable wrap). Two independent content keys are minted;
 * the secret key is only generated and wrapped at the 'body+secret' tier.
 */
export async function createBlob(opts: CreateBlobOpts): Promise<ShareBlob> {
  const recipientPubB64 = resolveRecipientPub(opts);
  const recipientPub = await importPublicKey(recipientPubB64);

  // Ephemeral keypair, fresh per share.
  const eph = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const ephPub = bytesToB64url(
    new Uint8Array(await subtle.exportKey('raw', eph.publicKey)),
  );
  const KW = await deriveWrappingKey(eph.privateKey, recipientPub);

  // Body is always encrypted under its own random key.
  const kb = await generateContentKey();
  const bodyCt = await aesEncrypt(kb.key, opts.bodyBytes);

  let secretCt: AesLayer | null = null;
  const wrapObj: WrapObj = { kb: bytesToB64url(kb.raw) };
  if (opts.tier === 'body+secret' && opts.secretBytes) {
    const ks = await generateContentKey();
    secretCt = await aesEncrypt(ks.key, opts.secretBytes);
    wrapObj.ks = bytesToB64url(ks.raw);
  }

  const wrap = await aesEncrypt(KW, utf8ToBytes(JSON.stringify(wrapObj)));

  return {
    v: 1,
    alg: ALG,
    eph: ephPub,
    from: { name: opts.sender.name, pub: opts.sender.pub },
    tier: opts.tier,
    wrap,
    body: bodyCt,
    secret: secretCt,
  };
}

export interface OpenBlobResult {
  from: { name: string; pub: string };
  tier: Tier;
  bodyBytes: Uint8Array;
  secretBytes: Uint8Array | null;
}

/**
 * Open a blob addressed to `me`. Derives the same wrapping key via ECDH(myPriv, eph),
 * unwraps the content keys, and decrypts. A blob not addressed to us fails the wrap
 * AES-GCM tag -> CryptoAuthError (fail-closed).
 */
export async function openBlob(opts: {
  me: Identity;
  blob: ShareBlob;
}): Promise<OpenBlobResult> {
  const { me, blob } = opts;
  validateBlobShape(blob);

  const myPriv = await importPrivateKey(me);
  const ephPub = await importPublicKey(blob.eph);
  const KW = await deriveWrappingKey(myPriv, ephPub);

  // Throws CryptoAuthError if the blob is not addressed to us (wrong KW).
  const wrapBytes = await aesDecrypt(KW, blob.wrap);
  const wrapObj = parseWrapObj(wrapBytes);

  const kb = await importContentKey(b64urlToBytes(wrapObj.kb));
  const bodyBytes = await aesDecrypt(kb, blob.body);

  let secretBytes: Uint8Array | null = null;
  if (blob.secret && wrapObj.ks) {
    const ks = await importContentKey(b64urlToBytes(wrapObj.ks));
    secretBytes = await aesDecrypt(ks, blob.secret);
  }

  return { from: blob.from, tier: blob.tier, bodyBytes, secretBytes };
}

/** Serialize a blob to its `cp-blob` JSON string (droppable anywhere). */
export function encodeBlob(blob: ShareBlob): string {
  return JSON.stringify(blob);
}

/** Parse and validate a serialized blob. */
export function decodeBlob(s: string): ShareBlob {
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    throw new CryptoFormatError('malformed blob: not valid JSON');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new CryptoFormatError('malformed blob: not an object');
  }
  const blob = obj as ShareBlob;
  validateBlobShape(blob);
  return blob;
}

function resolveRecipientPub(opts: CreateBlobOpts): string {
  if (opts.recipientPub) {
    return opts.recipientPub;
  }
  if (opts.recipientCard) {
    return decodePublicCard(opts.recipientCard).pub;
  }
  throw new CryptoFormatError('createBlob requires recipientPub or recipientCard');
}

function isLayer(x: unknown): x is AesLayer {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as AesLayer).iv === 'string' &&
    typeof (x as AesLayer).ct === 'string'
  );
}

function validateBlobShape(blob: ShareBlob): void {
  if (typeof blob !== 'object' || blob === null) {
    throw new CryptoFormatError('malformed blob: not an object');
  }
  if (blob.v !== 1) {
    throw new CryptoVersionError(`unsupported blob version: ${String(blob.v)}`);
  }
  if (blob.alg !== ALG) {
    throw new CryptoVersionError(`unsupported blob alg: ${String(blob.alg)}`);
  }
  if (blob.tier !== 'body' && blob.tier !== 'body+secret') {
    throw new CryptoFormatError(`malformed blob: invalid tier ${String(blob.tier)}`);
  }
  if (typeof blob.eph !== 'string') {
    throw new CryptoFormatError('malformed blob: missing eph');
  }
  if (
    typeof blob.from !== 'object' ||
    blob.from === null ||
    typeof blob.from.name !== 'string' ||
    typeof blob.from.pub !== 'string'
  ) {
    throw new CryptoFormatError('malformed blob: missing/invalid from');
  }
  if (!isLayer(blob.wrap) || !isLayer(blob.body)) {
    throw new CryptoFormatError('malformed blob: missing wrap/body layer');
  }
  if (blob.secret !== null && !isLayer(blob.secret)) {
    throw new CryptoFormatError('malformed blob: invalid secret layer');
  }
}

function parseWrapObj(bytes: Uint8Array): WrapObj {
  let obj: unknown;
  try {
    obj = JSON.parse(bytesToUtf8(bytes));
  } catch {
    // Unwrap succeeded (auth passed) but payload is junk - treat as auth failure.
    throw new CryptoAuthError('unwrapped key material is malformed');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new CryptoAuthError('unwrapped key material is malformed');
  }
  const w = obj as WrapObj;
  if (typeof w.kb !== 'string') {
    throw new CryptoAuthError('unwrapped key material missing body key');
  }
  return w;
}
