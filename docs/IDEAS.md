# claudepad - Ideas & future-task tracker

A lightweight running list of ideas and not-yet-scheduled tasks that don't (yet)
belong in a PRD, the ROADMAP, or the decision log. Promote an item into
`ROADMAP.md` / `DECISIONS.md` / a PRD when it's ready to build; delete it once
shipped or dropped.

> Committed scope → `ROADMAP.md`. Decisions → `DECISIONS.md`. Consciously
> deferred-to-vNext items → `DECISIONS.md` → vNext backlog.

---

## ▶ Next session scope · _logged 2026-06-21_

**1. Ingest / share-entry improvements - ✅ shipped 2026-06-21.**
- `.cpblob` → **`.cpad`** everywhere (ShareDialog download, ReceiveDialog
  `accept`, all docs/PRDs; the `cp-blob-` string prefix stays).
- The home drop/paste/file-picker surfaces now **accept encrypted blobs** - a
  `cp-blob-…` (string or `.cpad` file) is sniffed (`share/detect.ts`
  `isShareBlob`) in `useSession` and handed to the receive→decrypt flow
  (`onShareBlob` → `ReceiveDialog initialBlob`, auto-decrypts on open) instead
  of the parser.
- A **single Open picker** (`OPEN_ACCEPT`, `.jsonl` + `.cpad`) backs both the
  sidebar brand-nav button and the Overview "Open…" action; content (not the
  extension) routes parse vs. decrypt.

**Still open - deeper sidebar visual pass:** the brand-nav Open label was
updated, but a broader polish of spacing, the connect/identity footer, and the
collapsed-rail state is deferred (kept light here to avoid touching the
contrast/e2e gates without a specific defect).

**2. P4 (Playback, PRD-08) - ✅ shipped 2026-06-21.** Pure timeline engine
(`packages/client/src/playback/**`), rAF clock, an in-flow transport bar
(play/pause, prev/next, scrubber) with a **settings popover** (pacing mode,
speed, **appear: instant/type**, reading-speed), keyboard map + help, deep-link
params, reduced-motion, progressive reveal + active highlight + scroll-to-active.
Present mode **fast-tracks** thinking/meta; **typing appear** streams the active
turn paced to its dwell. See `DECISIONS.md` D-59/D-60 and the P4 follow-ups below.

---

## Go-to-market / launch

### Fast-paced "Show HN" launch path · _logged 2026-06-20_

**Idea:** try a fast, lean path to a **Show HN: claudepad** launch on Hacker News -
get the frictionless folder-connect + prettify experience in front of people
*early*, rather than waiting for full v1 (identity + trustless sharing).

**Why it fits:** the local-only, serverless, zero-signup experience is already
demoable and self-hostable; the "connect `~/.claude` once → browse every session"
moment is a strong, screenshot-able hook that no other tool has.

**Prep / open questions:**
- Minimum-lovable cut for Show HN - prettify + folder-connect + sample session,
  sharing explicitly "coming soon"? (Launch *before* P2/P3, tease sharing.)
- Hosted `claudepad.io` static instance + a one-command self-host story.
- Privacy framing front-and-center: no upload, no backend, read-only folder access
  (honesty-over-polish, `TRUSTLESS-MODEL.md` §7).
- Landing page + a ~30s screen capture of the connect-once flow.
- HN timing/title; line up a few early upvoters; prepare for the "why not just read
  the JSONL?" and "is my data uploaded?" questions.

**Status:** idea - not scheduled.


## Additional Features

- "Launch in VS Code" icon in sidebar - **✅ shipped 2026-06-21 (project + session,
  D-63).** Hover-revealed `Code2` button on each `ProjectRow` and `SessionRow`
  opens `vscode://file/<path>` (`VaultSession` now retains `cwd`).

### Turn Component Logic - ✅ shipped 2026-06-21 (D-61, D-63)

- Matcher→component registry: `viewer/components/turns/registry.tsx` is an
  ordered `{ id, match(row), render(row, ctx) }` list (first match wins);
  `TurnRenderer` is now a one-liner over `matchTurn(row)`. Add a turn type = add
  an entry. Custom turns: **SlashCommandTurn**, **TaskListTurn**,
  **CommandOutputTurn** (`system:local_command`), **AskUserQuestionTurn**, plus
  richer Read/web tool summaries.
- **Event-group filter (D-63):** a persisted top-bar dropdown toggles
  messages / tools / bash / commands / system (system off by default); the
  viewer + playback share one `EventFilterProvider` so filtered groups are
  ignored everywhere.
- **Next custom turns:** Bash-as-terminal / Edit+Write as a diff view; AwaySummary
  styling; per-MCP-tool renderers.

### Viewer Themes

- Themes for users to select to brand the session viewing appearance.
- A Viewer Theme is defined as JSON, and provides deep style customization.
- Ability to customize theme-global design tokens (e.g. base colors).
- Ability to customize individual Turn components (now that the registry exists,
  a theme could swap a matcher's component).

### Turn Rendering for Usability - partially shipped 2026-06-21 (D-61)

- **Done:** moderate prominence (user turns get a clay left-accent on a white
  surface; tool calls recede onto the canvas), and **noise folding** via
  `eventVisibility.isHiddenEvent` - pure session-metadata/telemetry
  (`mode`/`ai-title`/`file-history-snapshot`/…, `turn_duration`, chatter
  attachments like `task_reminder`/`deferred_tools_delta`/`hook_*`) is dropped
  inside `correlateTools`, so viewer + playback filter identically and stay
  index-aligned. Preserved in the raw view (nothing lost).
- **Consecutive-run collapse - ✅ shipped 2026-06-21 (D-62, extended D-63).**
  `groupRows` folds runs of >= 3 consecutive tool rows into a `ToolRunGroup`
  ("Read ×6" when uniform, "6 tool calls" when **mixed-name**; collapsed,
  expandable; auto-expands for a deep-link target) and inserts **idle "N later"
  dividers** for >= 5 min real-time gaps. The fold is a pure *display* transform:
  `TranscriptList` takes view items but its public API still speaks base-row
  positions (`baseToViewIndex` maps them), so the TOC/deep-links/playback indices
  never desync. Grouping + dividers are **reading-view only** - during playback
  the surface renders base rows 1:1 (the timeline already paces tool-spam/idle).
- **Still open:** grouping *during* playback (would need partial-group reveal).

## P3 hardening follow-ups · _logged 2026-06-21_

Deferred from the P3 (Trustless Sharing + Secrets) build - the end-to-end flow
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

## P4 playback follow-ups · _logged 2026-06-21_

Deferred from the P4 (Playback) build - the engine + transport + viewer
integration ship and are tested (unit + e2e). These are surface polish/validation
for the launch pass (PRD-09). See `DECISIONS.md` D-60.

- **In-transcript folded affordances (PRD-08 FR-11/12).** Tool-spam runs and
  idle gaps are already folded/collapsed in the *timeline* and marked on the
  *scrubber*; the in-surface "ran `Read` ×7" collapsible and the "… N min later
  …" idle divider are not yet rendered. Reuse PRD-03's collapsible tool component.
- **Ghosted future-events preview (Q-5b).** A faint preview of upcoming events;
  off by default, evaluate after dogfooding.
- **Pacing tuning + ≥5k-event perf smoke (PRD-08 Q-5 / FR-20).** Tune
  `readingSpeed`/`idleThreshold`/weights against a labeled set of real recorded
  presentations before locking v1 numbers (they're data in one config); add the
  Playwright performance smoke on a long-session fixture (engine is O(n) +
  memoized; reveal inherits PRD-03 virtualization).
- **Per-share saved tempo (PRD-08 OQ).** Let a sharer persist mode/speed into a
  link's playback params (query string only - never the key fragment).
