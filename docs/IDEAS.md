# claudepad - Ideas & future-task tracker

A lightweight running list of ideas and not-yet-scheduled tasks that don't (yet)
belong in a PRD, the ROADMAP, or the decision log. Promote an item into
`ROADMAP.md` / `DECISIONS.md` / a PRD when it's ready to build; delete it once
shipped or dropped.

> Committed scope → `ROADMAP.md`. Decisions → `DECISIONS.md`. Consciously
> deferred-to-vNext items → `DECISIONS.md` → vNext backlog.

---

## 🐞 Bugs to fix · _logged 2026-06-22_

- **Share fails: "Redaction failed an integrity check - not sharing."** Hit when
  sharing the session titled *"Surface start-time failures in session connect"*.
  This is the defensive hard gate in `ShareDialog.encrypt` -
  `findLeakedValues(body, secretMap)` returned a non-empty list, so a confirmed
  secret value still appeared in the redacted body. Likely causes to investigate:
  a secret value that is a substring of another (so replacing one re-exposes
  another), overlapping/manual literals, or a redaction location the rewriter
  misses that the leak-scan checks (e.g. a string leaf in tool I/O the redactor
  doesn't traverse but `findLeakedValues` does). Repro with that session, then
  fix `@claudepad/secrets` `redact`/`findLeakedValues` so the gate passes for a
  legitimately-redacted body (and add a regression fixture). Until fixed, the
  user cannot share this session at all.

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
  never desync. Grouping + dividers now also render **during playback**
  (✅ 2026-06-22, `revealedViewItems`), driven by the timeline's fold/idle
  segments so folded runs reveal atomically (no partial-group reveal).

## P3 hardening follow-ups · _logged 2026-06-21_

Deferred from the P3 (Trustless Sharing + Secrets) build - the end-to-end flow
ships and is tested; these are quality/scale hardening for the pre-launch
security pass (PRD-09). See `DECISIONS.md` D-58.

- **Web-Worker scan (PRD-06 FR-10) - ✅ shipped 2026-06-22.** `scanSession` now
  takes an optional `onProgress` hook (pure, deterministic output unchanged); the
  client runs it in a module worker (`share/secretScan.worker.ts`) via
  `useSecretScan`, with a live progress bar in the review step and cancellation by
  terminating the worker on close. Main-thread `setTimeout` fallback where
  `Worker` is unavailable.
- **Labeled corpus + published recall/precision (PRD-06 AC-10) - ✅ shipped
  2026-06-22.** `secrets/test/corpus.test.ts` is a ground-truth corpus (19 fake
  secrets across the taxonomy + 8 decoys incl. git SHA/UUID/SHA-256/path/base64
  image/minified JS). Measured **recall 1.0** (asserts ≥ 0.95) and **precision
  0.917** (asserts ≥ 0.85; the only FPs are the two unstructured high-entropy
  decoys). Numbers live in `secrets/src/quality.ts` (`DETECTION_QUALITY`), the
  test asserts the live scanner meets them, and the share **review step** shows
  them via a "How good is detection?" disclosure (FR-32).
- **Advanced review UI (PRD-06 FR-15–17) - ✅ core shipped 2026-06-22.** The
  review step now has a **sensitivity** control (Strict/Balanced/Aggressive
  presets that re-scan via the worker, preserving hand-added literals), **bulk
  actions** (Redact all / Dismiss all on the shown set), and a **Hide dismissed**
  filter to fold suppressed noise. **Still deferred** (lower value, awkward under
  value-based redaction): edit a detection's span, merge rows into one `S#`,
  override the type label.
- **Multi-recipient single blob (PRD-11 Q-14) - ✅ shipped 2026-06-22.**
  `@claudepad/shared` gained `createMultiBlob` + `MultiShareBlob` (payload
  encrypted once under shared content keys, wrapped per recipient with a fresh
  ephemeral each; `openBlob` tries each wrap, fail-closed). The share flow now
  takes multiple confirmed recipients: one -> a single-recipient blob (leaks
  nothing, still the default); several -> one multi-recipient blob (exposes the
  recipient count, by design, surfaced in the UI copy). Proven by unit tests +
  `poc/verify.mjs` (now 21 checks) + the share-to-self e2e.
- **Address book (PRD-11 OQ-A / PRD-10 OQ-C) - ✅ shipped 2026-06-22.**
  `useAddressBook` persists recent recipients' **public** cards (+ optional local
  alias) in localStorage (dedupe by pub, most-recent-first, capped at 12, never
  uploaded). The recipient step lists them ("Recent recipients") to pick/rename/
  forget; a successful share remembers the recipient. Covered by unit tests +
  the new `share.spec.ts` e2e.

## P4 playback follow-ups · _logged 2026-06-21_

Deferred from the P4 (Playback) build - the engine + transport + viewer
integration ship and are tested (unit + e2e). These are surface polish/validation
for the launch pass (PRD-09). See `DECISIONS.md` D-60.

- **In-transcript folded affordances (PRD-08 FR-11/12) - ✅ shipped 2026-06-22.**
  During playback the surface now renders the same `ToolRunGroup` ("Read ×7") and
  `IdleDivider` ("N min later") as the reading view, driven by the *timeline's*
  fold/idle segments (`revealedViewItems` in `groupRows.ts`) rather than by
  re-grouping the revealed slice. Because the engine reveals a folded run
  atomically (revealedCount jumps to its `rowEnd`), there is no half-revealed
  group - resolving the open "partial-group reveal" problem below.
- **Ghosted future-events preview (Q-5b).** A faint preview of upcoming events;
  off by default, evaluate after dogfooding.
- **Pacing tuning + ≥5k-event perf smoke (PRD-08 Q-5 / FR-20).** Perf smoke
  **✅ shipped 2026-06-22**: `test/playback.perf.test.ts` asserts O(n) build +
  O(log n) seek + no-rebuild-on-playhead at 5.2k events, and an e2e
  (`playback.spec.ts` "drives playback over a >= 5k-event session") loads a
  generated long session and seeks end-to-end. **Still open:** pacing *tuning* -
  tune `readingSpeed`/`idleThreshold`/weights against a labeled set of real
  recorded presentations before locking v1 numbers (they're data in one config).
- **Per-share saved tempo (PRD-08 OQ).** Let a sharer persist mode/speed into a
  link's playback params (query string only - never the key fragment).
