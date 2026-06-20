# claudepad — Concept & Prior Art

> Captures the founding brainstorm: the idea, why it's worth building, and how it sits against existing tools.

## The idea

Many people now use Claude Code (terminal, desktop app, VS Code extension). At some point they want to **share a session** with others — but the built-in options fall short:

- `/copy` only grabs the last message.
- `/export` output is verbose and unpolished.
- Sometimes a user just wants to **prettify** a raw session JSON, nothing more.

claudepad solves this with an easy, secure, hosted (and self-hostable) viewer:

- **Easy** — drop the file or paste the clipboard → instantly see the full, prettified session → get a private shareable URL.
- **Secure** — multiple layers: a secret-URL / zero-knowledge scheme so untrusted eyes can't read the session, plus a novel **tiered secret reveal** so leaked `.env` tokens etc. are stripped for low-privilege viewers but visible to high-privilege ones. Ideal end state: even claudepad.io cannot read the session (or at least the secrets), borrowing ideas from PGP/GPG.
- **Bonus** — **session playback**: replay a session visually with speed control and a "presentation mode" that auto-picks a good pace.

## Why now / why it's worth building

- The *viewer* niche is crowded but almost entirely **local/desktop, privacy-first** ("your data never leaves your device") — they prettify, they don't **share**.
- **Secrets-in-sessions** is a live, painful problem with real demand (multiple Claude Code issues and third-party redaction tools exist).
- The unfilled combination is: **open-source + self-hostable + genuinely zero-knowledge + tiered secret reveal + playback**. That is the wedge.

## Prior art / competitive landscape

### Viewers (local-first; prettify, don't share)
- **claude-code-history-viewer** (desktop, multi-provider) — github.com/jhlee0409/claude-code-history-viewer
- **clog** (web viewer, real-time monitoring) — github.com/HillviewCap/clog
- **claude-JSONL-browser** (JSONL → Markdown) — github.com/withLinda/claude-JSONL-browser
- **claude-session-viewer** (parse → readable markdown) — github.com/jtklinger/claude-session-viewer
- **VS Code "Claude Code and Codex Assist"** — chat history, diffs, usage
- Common theme: explicit "data stays on your device." They solve *prettify*, not *share*.

### Closest competitor (hosted sharing)
- **vibeshub.ai** — shares Claude Code/Codex sessions as **replayable traces**, with public/private viewers and **automatic secret redaction**. Closest to our concept (even has playback). Unconfirmed whether it is zero-knowledge, open-source, or self-hostable — that ambiguity is precisely our differentiation.

### Secrets-in-Claude tooling (validates the pain)
- **nopeek**, **LLM Secrets**, **Claude Secrets** plugin — local secret loading/redaction for Claude Code.
- Claude Code issues #20966, #44868, #32733 — secret exposure in tool output / secure injection requests.

### Crypto prior art to borrow
- **PrivateBin** (github.com/PrivateBin/PrivateBin) — minimalist, zero-knowledge pastebin. AES-256-GCM in the browser; decryption key in the URL fragment (never sent to server); supports burn-after-read, expiry, optional password. This is the proven pattern claudepad extends with **two-key tiered reveal**.

## Our differentiation (the wedge) — as chosen for v1

The brainstorm converged on a **serverless, trustless** v1 (DECISIONS D-20…D-33), validated by a working proof of concept (`poc/`):

1. **No server at all** — v1 is a static client. "The host can't read it" because there is no host. Self-host = serve files.
2. **Trustless recipient sharing** — encrypt a session *to a person's public key*; the blob is the message, droppable anywhere; only the invited recipient can read it. (See `TRUSTLESS-MODEL.md`.)
3. **Tiered secret reveal** — per-recipient, via wrapping two independent content keys (body vs body+secrets).
4. **Verifiable identity** — client-minted keypair, fingerprint verification, optional passkey/device protection (WebAuthn PRF) — no accounts.
5. **Pluggable, open-spec store (vNext)** — an *optional* zero-knowledge blob store defined by an open contract (reference impl `claudepad.io/store`), Bitwarden/Headscale-style — never a proprietary dependency. (See `STORE-PROVIDER-SPEC.md`.)
6. **Playback with presentation mode** — delight layer.

## Honest correction carried forward

The original "replace secret with `[SHA512:…]`" idea was refined: a hash is one-way (can't be revealed to high-priv viewers) and brute-forceable for low-entropy secrets. We instead use **opaque random placeholders indexing an encrypted secret map**, displaying only a type+length label. Full reasoning in `SECURITY-MODEL.md`.

## MVP order (as finalized in the roadmap)

1. Tolerant parser + pretty render (usable offline alone)
2. Identity + fingerprints + optional device keys (the recipient model's foundation)
3. Trustless recipient sharing + two-key tiered reveal ← **the moat**
4. Playback
5. Optional pluggable store (hosted URLs) ← **vNext, open spec**

> The architecture flipped during the brainstorm: the once-"vNext" named-recipient model **became** the v1 sharing mechanism (minus the server), and PrivateBin-style link sharing + the backend moved to the optional store addon. See `ROADMAP.md` for phases, `TRUSTLESS-MODEL.md` for the design, and `prd/` for detailed PRDs.

See `ROADMAP.md` for phases and `prd/` for detailed PRDs.
