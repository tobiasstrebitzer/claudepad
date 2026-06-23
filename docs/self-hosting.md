# Self-hosting claudepad

claudepad v1 is **entirely client-side**: there is no server, no database, no blob store. "Self-host" therefore means **serve some static files**. The hosted instance at `claudepad.io` runs the identical bundle - self-host carries no security or feature penalty.

## TL;DR

```sh
pnpm install
pnpm build                       # builds packages → client static bundle
# the bundle is at packages/client/dist - serve it with any static host:
npx serve packages/client/dist   # or nginx, Caddy, GitHub Pages, S3+CloudFront, …
```

Open the served URL. Drop a `~/.claude/projects/*.jsonl` session, prettify, mint an identity, share. Done.

## Why it's this simple

Everything runs in the browser:

- session parsing & prettify,
- identity (an ECDH keypair minted locally, stored in IndexedDB),
- encrypt-to-recipient sharing with per-recipient secret tiering,
- decryption of received blobs,
- playback.

No flow contacts a network service. The client contains **no `claudepad.io/store` URL and no store-specific code** by design (DECISIONS D-33). Fonts are self-hosted (`@fontsource`), there are no CDN or third-party script fetches - which is also a [security property](./THREAT-MODEL.md#web-hygiene-is-part-of-the-model).

## Build the bundle

Requires Node ≥ 20 and pnpm.

```sh
pnpm install
pnpm build
```

Output: `packages/client/dist/` - a self-contained static site (HTML + hashed JS/CSS/font assets). Serve that directory from anything that serves files.

## Serving options

### Any static file server

```sh
npx serve packages/client/dist
# or
python3 -m http.server --directory packages/client/dist 8080
```

The app is a single-page app; configure your host to **fall back to `index.html`** for unknown routes so deep links (`#/…`) resolve.

### nginx

```nginx
server {
  root /var/www/claudepad/dist;
  location / { try_files $uri /index.html; }
}
```

### Cloudflare Workers / Pages (what `claudepad.io` uses)

The repo ships a [`packages/client/wrangler.jsonc`](../packages/client/wrangler.jsonc) that serves `./dist` as SPA assets:

```sh
pnpm build
pnpm --filter @claudepad/client run deploy   # wrangler deploy
```

`not_found_handling: "single-page-application"` gives you the SPA fallback for free. Point the `routes` custom domain at your own hostname (the committed config targets `claudepad.io`).

## A note on WebAuthn (passkey device protection)

Optional passkey protection of your identity (WebAuthn PRF) requires a **real origin** - it works on `localhost`, any self-hosted domain, and `claudepad.io`, but **not** from `file://`. If you just open `index.html` directly, everything works except passkey locking; serve over `http://localhost` or a domain to use it.

## What you do NOT need

No Postgres, no S3/MinIO, no Docker, no API server, no accounts, no environment variables, no secrets to manage. The `docker compose` + Postgres + MinIO + Workers/R2 path described in [PRD-09](./prd/PRD-09-selfhost-launch.md) is for the **optional, deferred store addon** (vNext), not for running v1.

## Verify there's really no server

Don't take our word for it - see [`VERIFY_ZERO_KNOWLEDGE.md`](./VERIFY_ZERO_KNOWLEDGE.md) to confirm with your browser's network panel that nothing leaves the page.
