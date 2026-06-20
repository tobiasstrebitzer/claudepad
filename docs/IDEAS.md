# claudepad — Ideas & future-task tracker

A lightweight running list of ideas and not-yet-scheduled tasks that don't (yet)
belong in a PRD, the ROADMAP, or the decision log. Promote an item into
`ROADMAP.md` / `DECISIONS.md` / a PRD when it's ready to build; delete it once
shipped or dropped.

> Committed scope → `ROADMAP.md`. Decisions → `DECISIONS.md`. Consciously
> deferred-to-vNext items → `DECISIONS.md` → vNext backlog.

---

## ▶ Next session scope · _logged 2026-06-21_

Pick up here next session.

**1. Ingest / share-entry improvements (do first):**
- **Rename the blob extension `.cpblob` → `.cpad`** everywhere (ShareDialog
  download `claudepad-share-<name>.cpad`, ReceiveDialog `accept`, any docs/PRD
  references). The `cp-blob-` *string* prefix can stay; this is just the file
  extension.
- **Accept encrypted blobs on the home drop/paste surface**, not just `.jsonl`.
  Dropping/pasting a `cp-blob-…` (or `.cpad` file) should route into the
  receive→decrypt flow instead of the JSONL parser. Detect by the `cp-blob-`
  prefix (see `client/src/ingest/useSession.ts` + `@claudepad/ingest` `classify`,
  and `client/src/share/ReceiveDialog.tsx`/`blob.ts`).
- **Unified top-bar Open button → file picker** that accepts both `.jsonl` and
  `.cpad`, dispatching to parse vs. decrypt by content. (Sidebar brand-nav
  `FolderOpen` button + the Overview "Open encrypted…" action could converge.)
- **Sidebar UI/UX pass** — general polish (no specific defects logged yet;
  review spacing, the connect/identity footer, and the collapsed-rail state).

**2. Then P4 (Playback, PRD-08):** timeline scrubber, speed control,
presentation-mode auto-pacing — pure client-side. See `ROADMAP.md` §4.

---

## Go-to-market / launch

### Fast-paced "Show HN" launch path · _logged 2026-06-20_

**Idea:** try a fast, lean path to a **Show HN: claudepad** launch on Hacker News —
get the frictionless folder-connect + prettify experience in front of people
*early*, rather than waiting for full v1 (identity + trustless sharing).

**Why it fits:** the local-only, serverless, zero-signup experience is already
demoable and self-hostable; the "connect `~/.claude` once → browse every session"
moment is a strong, screenshot-able hook that no other tool has.

**Prep / open questions:**
- Minimum-lovable cut for Show HN — prettify + folder-connect + sample session,
  sharing explicitly "coming soon"? (Launch *before* P2/P3, tease sharing.)
- Hosted `claudepad.io` static instance + a one-command self-host story.
- Privacy framing front-and-center: no upload, no backend, read-only folder access
  (honesty-over-polish, `TRUSTLESS-MODEL.md` §7).
- Landing page + a ~30s screen capture of the connect-once flow.
- HN timing/title; line up a few early upvoters; prepare for the "why not just read
  the JSONL?" and "is my data uploaded?" questions.

**Status:** idea — not scheduled.


## Additional Features

- "Launch in VS Code" icon in project sidebar list

### Turn Component Logic

- Mapping of "matchers" to Viewer React Components
- (e.g. "type": "system", "subtype": "local_command" > SystemLocalCommandTurn) 
- This allows a flexible way to extend the Turn renderer

### Viewer Themes

- Themes for users to select to brand the session viewing appearance.
- A Viewer Theme is defined as JSON, and provides deep style customization.
- Ability to customize theme-global design tokens (e.g. base colors).
- Ability to customize individual Turn components.

## P3 hardening follow-ups · _logged 2026-06-21_

Deferred from the P3 (Trustless Sharing + Secrets) build — the end-to-end flow
ships and is tested; these are quality/scale hardening for the pre-launch
security pass (PRD-09). See `DECISIONS.md` D-58.

- **Web-Worker scan (PRD-06 FR-10).** The scanner runs on the main thread today
  (deferred behind a `setTimeout` so the dialog paints first). Move to a worker
  with progress + cancellation for very large sessions.
- **Labeled corpus + published recall/precision (PRD-06 AC-10).** Build the
  ground-truth fixture corpus (taxonomy types + decoys: git SHAs, UUIDs, base64
  images, minified JS) and document the recall ≥ 0.95 / precision numbers; link
  from the review UI ("how good is detection?", FR-32).
- **Advanced review UI (PRD-06 FR-15–17).** Edit a detection's span, merge rows
  into one `S#`, override the type label, a sensitivity slider, and bulk
  filters. Today: redact/dismiss toggle + add-literal + acknowledge.
- **Multi-recipient single blob (PRD-11 Q-14).** Today = one blob per recipient
  (leaks nothing). A single blob with per-recipient wrapped entries saves
  re-encryption at the cost of exposing the recipient count.
- **Address book (PRD-11 OQ-A / PRD-10 OQ-C).** Remember recent recipients'
  public cards + local aliases so keys aren't re-pasted each share.
