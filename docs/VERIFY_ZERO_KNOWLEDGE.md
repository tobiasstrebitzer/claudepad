# Verify zero-knowledge yourself

claudepad's central claim is: **nothing leaves your browser, and only the intended recipient can read a share.** You don't have to trust us - it's a property you can check. This page gives three independent verifications, from fastest to most thorough.

## 1. Crypto conformance (30 seconds, headless)

The crypto core is anchored by a headless conformance script. It proves the properties that matter:

```sh
node poc/verify.mjs
```

Among its checks:

- **non-recipient lockout** - a blob encrypted to one key cannot be decrypted by any other key (AES-GCM auth fails).
- **tiered decrypt** - a body-only blob never reveals secrets; a body+secrets blob does, for the right key only.
- **no plaintext in blob** - the serialized `cp-blob-…` contains no transcript text and no secret values, only ciphertext plus the sender's *public* card.
- **fingerprint stability & distinctness** - the same key always fingerprints the same; different keys differ.
- **device-key wrap/unwrap** - the WebAuthn-PRF wrapping layer round-trips.

The production crypto in [`packages/shared`](../packages/shared) mirrors this reference and the same suite runs in CI (`pnpm verify:poc`).

## 2. The bundle makes no third-party fetches (automatable)

Zero-knowledge requires that the shipped client never phones home - no CDN, no analytics, no font fetch. After a build, scan the bundle:

```sh
pnpm build
node scripts/check-no-external-origins.mjs
```

It scans `packages/client/dist` for absolute external origins in the shipped JS/CSS/HTML and fails on anything that isn't an inert allow-listed reference (XML namespaces, the project's own links rendered as text). A clean run means the bundle has no runtime network surface to leak through.

## 3. Watch the network during a real share (manual, most convincing)

This is the one that convinces a skeptic, because it observes the running app.

1. Build and serve the bundle (or use a self-hosted/`claudepad.io` instance):
   ```sh
   pnpm build && npx serve packages/client/dist
   ```
2. Open the served URL in a browser and open **DevTools → Network**. Tick **"Preserve log"** and clear the list.
3. Perform a full sensitive flow:
   - drop a real `~/.claude/projects/*.jsonl` session,
   - mint or unlock your identity,
   - paste a recipient public key, run the secret review, and **create a share blob**,
   - copy the blob / save the `.cpad`.
4. Inspect the Network log. You should see **only** the initial static-asset loads (HTML, JS, CSS, fonts from the same origin) - and **no** request that carries session content, secrets, or keys. There is no upload because there is no endpoint to upload to.

For an even stronger check, do the whole flow, then **disconnect from the network** (airplane mode) and confirm sharing still works end-to-end. It does: nothing was ever going to the network.

### Optional: capture at the OS level

If you don't trust the browser's own panel, capture at the network interface while you perform step 3:

```sh
# macOS/Linux, replace en0 with your interface; filter out localhost asset loads
sudo tcpdump -i en0 -A 'tcp and not host 127.0.0.1'
```

You will see no flow carrying the transcript or secret bytes during share creation.

## What this does and doesn't prove

- ✅ It proves the **claudepad client** uploads nothing and that a non-recipient cannot decrypt a blob.
- ⚠️ It does **not** govern where *you* then carry the blob. If you paste it into Slack, Slack sees a blob (ciphertext) and its metadata. That's expected - the blob is inert to anyone but the recipient, but your transport still logs that a message of some size was sent. See [`THREAT-MODEL.md`](./THREAT-MODEL.md#metadata).
