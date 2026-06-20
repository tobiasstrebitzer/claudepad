// Trustless serverless share — crypto verification.
// Mirrors the exact WebCrypto calls used in trustless-share.html.
// Run: node poc/verify.mjs
import { webcrypto } from 'node:crypto';
const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64url helpers ----
const b64 = (u8) => Buffer.from(u8).toString('base64url');
const buf = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const rand = (n) => webcrypto.getRandomValues(new Uint8Array(n));

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

// ---- identity ----
async function mintIdentity(name) {
  const kp = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const pub = b64(new Uint8Array(await subtle.exportKey('raw', kp.publicKey)));
  const priv = await subtle.exportKey('jwk', kp.privateKey);
  return { v: 1, name, pub, priv };           // the secret identity (export/back up)
}
const publicCard = (id) => b64(enc.encode(JSON.stringify({ v: 1, name: id.name, pub: id.pub })));
const parseCard = (s) => JSON.parse(dec.decode(buf(s)));
const importPriv = (id) => subtle.importKey('jwk', id.priv, ECDH, false, ['deriveBits']);
const importPub = (pubB64) => subtle.importKey('raw', buf(pubB64), ECDH, false, []);

// ---- ECDH -> HKDF -> AES-GCM wrapping key (symmetric both sides) ----
async function deriveKW(privKey, pubKey) {
  const bits = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pubKey }, privKey, 256));
  const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('claudepad-poc-v1') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---- AES-GCM ----
async function aesEnc(key, plaintext) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
async function aesDec(key, { iv, ct }) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ct));
  return new Uint8Array(pt);
}
async function genContentKey() {
  const raw = rand(32);
  const key = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return { raw, key };
}
const importContentKey = (raw) => subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

// ---- create a per-recipient blob (tier: 'body' | 'body+secret') ----
async function createBlob({ sender, recipientCard, body, secrets, tier }) {
  const recipientPub = await importPub(parseCard(recipientCard).pub);
  const eph = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const ephPub = b64(new Uint8Array(await subtle.exportKey('raw', eph.publicKey)));
  const KW = await deriveKW(eph.privateKey, recipientPub);

  const kb = await genContentKey();
  const bodyCt = await aesEnc(kb.key, enc.encode(body));

  let secretCt = null;
  const wrapObj = { kb: b64(kb.raw) };
  if (tier === 'body+secret' && secrets) {
    const ks = await genContentKey();
    secretCt = await aesEnc(ks.key, enc.encode(secrets));
    wrapObj.ks = b64(ks.raw);
  }
  const wrap = await aesEnc(KW, enc.encode(JSON.stringify(wrapObj)));

  return {
    v: 1, alg: 'ECDH-P256+HKDF-SHA256+AES-256-GCM', eph: ephPub,
    from: { name: sender.name, pub: sender.pub }, tier,
    wrap, body: bodyCt, secret: secretCt,
  };
}

// ---- key fingerprint (human-verifiable; SHA-256 over the raw public key) ----
const FP_EMOJI = ['😀','😁','😂','🤣','😅','😊','😍','😎','🤔','😴','🥳','😇','🤩','😜','😬','🙃',
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄',
  '🍎','🍌','🍇','🍓','🍉','🍒','🍑','🥝','🍍','🥑','🌽','🥕','🍔','🍕','🌮','🍩',
  '⚽','🏀','🏈','🎾','🎲','🎸','🎹','🎺','🚗','🚀','🛸','⛵','🏰','🌈','⭐','🔥'];
async function fingerprint(pubB64) {
  const h = new Uint8Array(await subtle.digest('SHA-256', buf(pubB64)));
  const emoji = [...h.slice(0, 6)].map((b) => FP_EMOJI[b & 63]).join(' ');
  const code = [...h.slice(6, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')
    .toUpperCase().replace(/(.{4})(.{4})/, '$1-$2');
  return { emoji, code };
}

// ---- open a blob as a recipient ----
async function openBlob({ me, blob }) {
  const myPriv = await importPriv(me);
  const ephPub = await importPub(blob.eph);
  const KW = await deriveKW(myPriv, ephPub);
  const wrapObj = JSON.parse(dec.decode(await aesDec(KW, blob.wrap))); // throws if not addressed to me
  const kb = await importContentKey(buf(wrapObj.kb));
  const body = dec.decode(await aesDec(kb, blob.body));
  let secrets = null;
  if (blob.secret && wrapObj.ks) {
    const ks = await importContentKey(buf(wrapObj.ks));
    secrets = dec.decode(await aesDec(ks, blob.secret));
  }
  return { from: blob.from, tier: blob.tier, body, secrets };
}

// ============================ TESTS ============================
let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? (pass++, console.log('  ✓', msg)) : (fail++, console.log('  ✗ FAIL:', msg)));

console.log('\nMinting identities (Toby = sharer, Steve = recipient, Eve = outsider)…');
const toby = await mintIdentity('Toby');
const steve = await mintIdentity('Steve');
const eve = await mintIdentity('Eve');
const steveCard = publicCard(steve);
console.log('  Steve\'s public card (this is what Toby pastes in):\n   ', steveCard.slice(0, 60) + '…');

const BODY = 'Assistant: Here is how to deploy.\nUser: thanks!\n[SECRET ••••(20)] used in step 3.';
const SECRETS = JSON.stringify({ S1: 'sk-live-51H9xExAmPlEtOkEnDoNoTuSe' });

console.log('\n[1] Toby shares BODY-ONLY with Steve:');
const lowBlob = await createBlob({ sender: toby, recipientCard: steveCard, body: BODY, secrets: SECRETS, tier: 'body' });
const lowOpen = await openBlob({ me: steve, blob: lowBlob });
ok(lowOpen.body === BODY, 'Steve reads the body');
ok(lowOpen.secrets === null, 'Steve does NOT receive secrets (body-only tier)');
ok(lowBlob.secret === null, 'blob carries no secret ciphertext at body-only tier');
ok(lowOpen.from.name === 'Toby', 'recipient sees sender name "Toby"');

console.log('\n[2] Toby shares BODY+SECRET with Steve:');
const hiBlob = await createBlob({ sender: toby, recipientCard: steveCard, body: BODY, secrets: SECRETS, tier: 'body+secret' });
const hiOpen = await openBlob({ me: steve, blob: hiBlob });
ok(hiOpen.body === BODY, 'Steve reads the body');
ok(hiOpen.secrets === SECRETS, 'Steve reads the secrets (high tier)');

console.log('\n[3] Eve (not the recipient) tries to open both blobs:');
let eveBlocked = 0;
for (const [label, blob] of [['body-only', lowBlob], ['high-tier', hiBlob]]) {
  try { await openBlob({ me: eve, blob }); console.log(`  ✗ FAIL: Eve decrypted the ${label} blob!`); fail++; }
  catch { eveBlocked++; }
}
ok(eveBlocked === 2, 'Eve cannot decrypt either blob (AES-GCM auth fails on wrong key)');

console.log('\n[4] The blob is just text — droppable anywhere (Slack, a file, a gist):');
const wire = JSON.stringify(hiBlob);
ok(!wire.includes('sk-live'), 'serialized blob contains NO plaintext secret');
ok(!wire.includes('deploy'), 'serialized blob contains NO plaintext body');
ok(JSON.parse(wire).from.name === 'Toby', 'only the (public, unverified) sender name is visible in the clear');
console.log('     wire size:', wire.length, 'bytes');

// KEK derived from a PRF secret (HKDF), mirrors the browser's device-protection path.
async function deriveKEK(prfBytes) {
  const hk = await subtle.importKey('raw', prfBytes, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('claudepad-poc-kek-v1') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

console.log('\n[5] Fingerprints (human-verifiable identity check):');
const fpSteve = await fingerprint(steve.pub);
const fpSteve2 = await fingerprint(steve.pub);
const fpToby = await fingerprint(toby.pub);
console.log(`     Steve: ${fpSteve.emoji}  ${fpSteve.code}`);
console.log(`     Toby:  ${fpToby.emoji}  ${fpToby.code}`);
ok(fpSteve.code === fpSteve2.code && fpSteve.emoji === fpSteve2.emoji, 'fingerprint is stable for the same key');
ok(fpSteve.code !== fpToby.code, 'different keys → different fingerprints');
// sender card in a blob carries the pubkey, so the recipient can fingerprint the sender:
const fpFromBlob = await fingerprint(hiBlob.from.pub);
ok(fpFromBlob.code === fpToby.code, 'recipient can verify the sender via the fingerprint in the blob');

console.log('\n[6] Device-key protection (WebAuthn PRF → KEK wraps the identity):');
console.log('     (the real PRF comes from a passkey/security key; here we simulate its 32-byte output)');
const prf = rand(32);                                   // stand-in for the authenticator's PRF result
const kek = await deriveKEK(prf);
const wrapped = await aesEnc(kek, enc.encode(JSON.stringify(steve)));  // identity at rest, device-locked
ok(!JSON.stringify(wrapped).includes(steve.priv.d), 'wrapped identity does not expose the private scalar');
const kekSame = await deriveKEK(prf);                   // same device, same touch → same PRF → same KEK
const recovered = JSON.parse(dec.decode(await aesDec(kekSame, wrapped)));
ok(recovered.pub === steve.pub && recovered.priv.d === steve.priv.d, 'identity unwraps with the same device PRF secret');
const kekWrong = await deriveKEK(rand(32));             // a different device/credential
let deviceBlocked = false;
try { await aesDec(kekWrong, wrapped); } catch { deviceBlocked = true; }
ok(deviceBlocked, 'identity does NOT unwrap with a different PRF secret (wrong/absent device)');

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
