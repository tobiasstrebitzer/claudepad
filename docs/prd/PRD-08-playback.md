# PRD-08 - Session Playback & Presentation Mode

**Phase:** P4 (Playback - the delight layer) · **Status:** Draft

> **Serverless-v1 note:** unchanged - playback is pure client-side over a `Session` that is either locally parsed or client-side-decrypted (PRD-11). No server, no new keys.
> Read [`_context.md`](./_context.md) first. This PRD conforms to the normalized model (§6), design tokens (§4), and security model (§5) defined there. It builds on the renderer in [PRD-03](./PRD-03-viewer.md) and the timestamped/ordered events produced by [PRD-02](./PRD-02-parser-schema.md).

---

## 1. Summary & problem

A static transcript shows *what* happened in a Claude Code session; it does not convey the *rhythm* - the pause while a tool ran, the burst of a long assistant turn, the back-and-forth tempo. PRD-08 adds **client-side playback**: replay a normalized `Session` over time with familiar transport controls (play/pause, scrubber, jump-to-event, variable speed), plus a **presentation mode** that auto-paces the replay for an audience (talk, demo, screen recording) by allotting dwell time proportional to rendered content length, collapsing dead idle gaps, and folding repetitive tool-spam. Playback is **pure client-side** over the already-decrypted in-memory model, so it works identically for a local drop-in session and a shared (decrypted) session, and introduces no new server surface and no new plaintext exposure.

## 2. Goals / Non-goals

**Goals**
- Replay any normalized `Session` over a virtual timeline using event timestamps, with synthetic pacing when timestamps are missing or coarse.
- Provide a complete, keyboard-driven transport: play/pause, scrub, jump-to-event (prev/next), variable speed `0.5×–8×`.
- Provide a **presentation mode** with a concrete, tunable auto-pacing heuristic (resolves open question **Q-5**).
- Layer playback *on top of* PRD-03's renderer (active-message highlight, progressive reveal, optional typing/streaming effect) without forking the render path.
- Work identically for local and shared/decrypted sessions; no server calls, no new ciphertext, no new key handling.
- Stay smooth on long sessions (thousands of events) and honor accessibility (`prefers-reduced-motion`, always pausable).

**Non-goals**
- No real-time / live session streaming (explicitly vNext per ROADMAP §5).
- No server-side rendering, recording, or export of a video file (a "record to MP4/GIF" export is a vNext idea, noted in §11, not built here).
- No editing/annotating the transcript during playback (read-only replay).
- No new crypto, key, or network behavior - PRD-05/06/07 own all of that; playback consumes the decrypted model only.
- No changes to the parser or normalized schema (PRD-02 owns it); playback is a pure consumer.

## 3. Personas & user stories

- **Sharer / presenter (primary)** - *As a developer giving a demo, I want to play a session back at a comfortable, auto-paced tempo so that my audience can follow the conversation without me scrolling and narrating mechanically.*
- **Sharer** - *As someone publishing a write-up, I want a shareable link that opens directly in presentation mode at a chosen speed so that recipients see a guided replay, not a wall of text.*
- **Low/high-priv viewer** - *As a recipient of a shared link, I want to scrub and replay the decrypted session client-side so that I can study the flow at my own pace - with secrets still redacted/revealed exactly as my tier allows.*
- **Local user** - *As someone reviewing my own `~/.claude/projects/*.jsonl` offline, I want to replay it to relive the session, with no network and no upload.*
- **Accessibility-sensitive viewer** - *As a user with `prefers-reduced-motion` set, I want playback to skip animations and remain fully pausable/scrubbable so that motion does not make the experience unusable.*

## 4. UX & flows

### 4.1 Entry points
- **Toggle from the viewer.** PRD-03's viewer gains a "Play" affordance in its toolbar. Activating it mounts the **transport bar** (fixed to the bottom of the viewport) and switches the render surface into *playback presentation*: the timeline starts at `t=0` with only events up to the playhead revealed.
- **Deep link.** A URL hint (query/fragment param, e.g. `&play=1&mode=present&speed=1.5`) opens straight into playback at a given mode/speed. For shared sessions this combines with the existing `#<K_body>[.<K_secret>]` fragment - playback params live in the query string, never carry keys, and never alter the fragment (see §8).
- **Exit.** "Stop" (or `Esc`) returns to the normal static viewer at full reveal, scrolled to the last-active message.

### 4.2 Transport bar (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ▶/⏸   ⏮  ⏭        00:42 / 07:18      �────────●───────────────────────   1.5× ▾│
│  play  prev next    elapsed / total   timeline scrubber (event ticks)    speed │
│                                                                                 │
│  [ Present ▾ ]   ⓘ markers: │user  ┃assistant  ╎tool  · idle-gap (collapsed)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Left cluster:** play/pause toggle, prev-event (`⏮`), next-event (`⏭`).
- **Center:** elapsed / total time (virtual playback time, *after* pacing transforms - not wall-clock of the original session), and the **scrubber**. The scrubber renders per-event tick marks colored by kind (user / assistant / thinking / tool / meta). Collapsed idle gaps render as a compressed `·····` segment with a hover tooltip ("idle 4m 12s → 0.8s").
- **Right cluster:** speed selector (`0.5× 0.75× 1× 1.5× 2× 4× 8×`), and a **mode** menu (`Real-time` vs `Presentation`, with a gear for pacing params).
- The bar uses design tokens (§4 of context): `--surface` background, `--border` hairline top, `--accent` (clay) for the playhead and the elapsed portion of the scrubber, `--text-muted` for tick marks. Restrained motion; the playhead moves with a linear transform, not a bouncy spring.

### 4.3 Render surface during playback
- **Progressive reveal:** events at or before the playhead are mounted; future events are not yet shown (or shown ghosted at very low opacity in presentation mode is a *non-default* option). Reaching an event reveals it.
- **Active-message highlight:** the event currently being "spoken" (the one whose dwell window contains the playhead) gets an accent left-border / subtle background lift, reusing PRD-03's message component states (no new component, a `data-active` style hook).
- **Smooth scroll-to-active:** the surface auto-scrolls so the active event is comfortably in view (anchored ~30% from the top), using `scrollIntoView({ behavior: 'smooth', block: 'center' })` - downgraded to `'auto'` (instant) under `prefers-reduced-motion` or at speed ≥ 4×.
- **Typing/streaming effect (optional, off by default):** assistant/thinking text can reveal token-by-token within its dwell window. This is a presentation flourish; it is **opt-in**, capped (never slower than the dwell budget allows), and fully disabled under reduced-motion. Code blocks, tool I/O, and images never "type" - they appear atomically (typing them is noisy and slow).
- **Scrubbing** jumps the model state to the target event instantly (no replay of intermediate animation); the surface snaps to that event.

### 4.4 Mode behaviors
- **Real-time mode:** dwell between events derives from the *actual* inter-event timestamp deltas (`tsᵢ₊₁ − tsᵢ`), scaled by the inverse of speed, clamped so a single gap never exceeds `MAX_REALTIME_GAP` (default 10s of virtual time) - otherwise a long human "thinking" pause stalls playback. Tool-run durations are preserved (they are the interesting rhythm) but also clamped.
- **Presentation mode:** dwell is *computed from content* via the §6 heuristic, idle gaps are collapsed, tool-spam is folded, and reading speed is the tunable knob. This is the default for the "Present" deep link and the recommended sharing tempo.

## 5. Functional requirements

Numbered, testable.

**Engine & timeline**
- **FR-1** The playback engine SHALL build, from a normalized `Session`, an ordered **timeline** of segments - one per visible event - each with a virtual start time and `dwell` (duration), such that `segment[i+1].start = segment[i].start + segment[i].dwell`.
- **FR-2** The engine SHALL compute dwell in **real-time mode** from event timestamp deltas when both adjacent events carry a parseable `ts`, clamped to `[MIN_DWELL, MAX_REALTIME_GAP]`, and SHALL fall back to the synthetic content-based dwell (FR-9 heuristic, neutral params) for any event whose `ts` is missing, unparseable, equal to its neighbor (coarse/identical timestamps), or out of order.
- **FR-3** The engine SHALL expose a single monotonic **playhead** (virtual ms). On each animation frame while playing, the playhead SHALL advance by `Δframe × speed`. The engine SHALL NOT use the original wall-clock; total duration is the sum of segment dwells.
- **FR-4** Given a playhead time, the engine SHALL deterministically resolve (a) the set of revealed events (start ≤ playhead) and (b) the single **active** event (the segment whose `[start, start+dwell)` contains the playhead).
- **FR-5** Speed changes SHALL take effect immediately and continuously (no restart, no playhead jump). Supported speeds: `0.5, 0.75, 1, 1.5, 2, 4, 8`.

**Transport & navigation**
- **FR-6** Play/pause SHALL toggle advancement; pausing SHALL freeze the playhead exactly (frame-accurate) and is always available (FR-22).
- **FR-7** The scrubber SHALL support drag and click-to-seek; seeking SHALL set the playhead to the mapped virtual time, reveal the correct event set instantly, and snap-scroll to the active event without replaying intermediate animation.
- **FR-8** Prev/next SHALL move the playhead to the start of the previous / next event segment. Reaching the end SHALL stop at the final event (not loop); reaching the start clamps to `t=0`. A "jump to event N" API SHALL exist for the scrubber tick marks and for deep links.

**Presentation pacing (resolves Q-5)**
- **FR-9** Presentation mode SHALL compute per-event dwell as `BASE + renderedLength / READING_SPEED`, where `renderedLength` is a content-weighted character count (FR-10) and `READING_SPEED` is configurable (default per §6), clamped to `[MIN_DWELL, MAX_DWELL]`.
- **FR-10** `renderedLength` SHALL weight content blocks by type so that scannable content reads faster than prose: text ×1.0, code ×0.35/char (people skim code), tool input/output ×0.25/char and additionally capped, images a flat per-image cost, thinking ×0.6. Weights SHALL be defined as named constants in one config object.
- **FR-11** Presentation mode SHALL **collapse idle gaps**: when the original inter-event gap exceeds `IDLE_THRESHOLD`, the contribution to the timeline is compressed to `IDLE_COLLAPSED` (a short beat), and the collapsed span SHALL be visibly marked on the scrubber and (optionally) by a thin "… N min later …" divider in the surface.
- **FR-12** Presentation mode SHALL **fold tool-spam**: a run of ≥ `TOOL_SPAM_RUN` consecutive `tool_use`/`tool_result` events of the same `name` (e.g. repeated `Read`/`Grep`) SHALL be grouped into one folded segment whose dwell is sublinear in the run length (FR per §6 formula), rendered as a single collapsible "ran `Read` ×7" affordance reusing PRD-03's collapsible tool component.
- **FR-13** All pacing parameters (reading speed, thresholds, weights, clamps) SHALL be exposed through a single typed config with defaults, overridable via the pacing-settings UI and via deep-link params, and SHALL be unit-testable in isolation (pure function: `Session → Timeline`).

**Render integration (PRD-03)**
- **FR-14** Playback SHALL reuse PRD-03's message/tool/code/thinking components unchanged; it MAY only add state hooks (`data-active`, reveal/hidden) and MUST NOT re-implement rendering or markdown/syntax highlighting.
- **FR-15** The active event SHALL receive a visible highlight using existing component states and the `--accent` token; at most one event is active at a time.
- **FR-16** The surface SHALL smooth-scroll the active event into view, downgrading to instant scroll under `prefers-reduced-motion` or at speed ≥ 4× (FR-21).
- **FR-17** The typing/streaming reveal effect SHALL be opt-in (off by default), apply only to plain text/thinking blocks (never code/tool I/O/images), never exceed the event's dwell budget, and be disabled entirely under `prefers-reduced-motion`.

**Local & shared parity**
- **FR-18** Playback SHALL operate solely on the in-memory normalized `Session`, identically for locally-loaded and shared-then-decrypted sessions, with **zero** network requests during playback.
- **FR-19** Secret placeholders SHALL render during playback exactly as the viewer (PRD-03) would for the viewer's key tier; playback SHALL NOT decrypt, reveal, or weaken any secret beyond what the loaded keys already permit. `renderedLength` SHALL be computed on the *rendered* (tier-appropriate) content so pacing leaks nothing about hidden secret length beyond the placeholder's own type+length label.

**Performance**
- **FR-20** Timeline construction SHALL be O(n) in event count and computed once per (session, mode, params) tuple, memoized; changing only the playhead SHALL NOT rebuild the timeline. Playback SHALL remain smooth (≥ ~50 fps on a mid-range laptop) on sessions of ≥ 5,000 events by reusing PRD-03's virtualization (only mounting near-playhead events).

**Accessibility**
- **FR-21** Playback SHALL honor `prefers-reduced-motion`: no typing effect, instant (non-smooth) scrolling, no playhead easing/animation flourishes - while keeping the timeline, reveal logic, and all controls fully functional.
- **FR-22** Playback SHALL always be **pausable and scrubbable**; there SHALL be no un-interruptible auto-advance. All transport controls SHALL be keyboard-operable and screen-reader labeled (the scrubber as an ARIA slider with value text "event X of N, mm:ss").

**Keyboard controls**
- **FR-23** The engine SHALL bind, when the playback surface is focused: `Space` play/pause; `←/→` seek by a small step (`SEEK_STEP`, default 5s virtual) / `⇧←/⇧→` prev/next event; `↑/↓` cycle speed up/down through the discrete steps; `J/K/L` (rewind/pause/play, video-editor convention); `Home/End` jump to start/end; `Esc` exit playback. Bindings SHALL not fire while a text input is focused and SHALL be documented in an in-app `?` help affordance.

## 6. Technical design

### 6.1 Architecture
A small, framework-light module sitting *beside* PRD-03's viewer, not inside the parser or crypto:

```
packages/client/src/playback/
  buildTimeline.ts     // pure: (Session, Mode, PacingConfig) -> Timeline   (FR-1,2,9–13)
  pacing.ts            // weights, formulas, clamps, idle/spam folding       (Q-5)
  usePlayback.ts       // hook: playhead clock (rAF), play state, seek API   (FR-3,5,6,7,8)
  PlaybackProvider.tsx // context bridging timeline + clock to the surface
  TransportBar.tsx     // play/pause/scrubber/speed/mode UI                  (§4.2)
  Scrubber.tsx         // ARIA slider, event ticks, collapsed-gap segments   (FR-7,22)
  keymap.ts            // keyboard bindings                                  (FR-23)
```

- **`buildTimeline` is a pure function** (`Session × Mode × PacingConfig → Timeline`) - the high-value unit-test target (Vitest, per context §3). Same input ⇒ same timeline; trivially fixture-testable against the parser's golden sessions.
- **`usePlayback`** owns the clock: a `requestAnimationFrame` loop that advances `playhead += (now − last) × speed` while playing, and the `play/pause/seek/seekToEvent/setSpeed` API. It derives `{revealedCount, activeIndex}` from `playhead` via binary search over segment starts (O(log n)).
- **State store:** a tiny Zustand slice (context §3 sanctions Zustand) for `{ mode, speed, isPlaying, playheadMs, pacingConfig }`; the timeline itself is memoized derived data, not stored.
- **Render integration:** the existing viewer reads `revealedCount`/`activeIndex` from context and applies `data-active` / reveal classes. The virtualizer already only mounts visible rows; playback simply scrolls to the active row, so virtualization (FR-20) is inherited from PRD-03 rather than re-built.

### 6.2 Playback state model

```
            seek / seekToEvent (any state, preserves play/pause)
                 ┌───────────────────────────────┐
                 ▼                               │
  ┌────────┐  play   ┌─────────┐   reaches end  ┌────────┐
  │ Idle   │───────▶ │ Playing │ ─────────────▶ │ Ended  │
  │(static)│ ◀────── │         │ ◀───────────── │        │
  └────────┘  exit   └─────────┘   seek<end     └────────┘
       ▲   exit ▲        │  ▲                        │
       │        │  pause │  │ play                   │ play (from end ⇒ restart at 0)
       │        │        ▼  │                        ▼
       │        └──── ┌─────────┐ ◀──────────────────┘
       └───────────── │ Paused  │
              exit    └─────────┘

State = { mode: 'realtime'|'present', status: Idle|Playing|Paused|Ended,
          playheadMs, speed, pacingConfig }
Derived (pure, from playheadMs + timeline): { revealedCount, activeIndex,
          scrubberFraction }
Invariants: 0 ≤ playheadMs ≤ totalMs ; exactly one activeIndex while not Idle ;
            changing speed/seek never leaves Playing↔Paused ; Ended is Playing
            that hit totalMs (auto-pauses, no loop).
```

### 6.3 Pacing heuristic (Q-5) - concrete algorithm & defaults

```
PacingConfig (defaults; all overridable via UI + deep link):
  READING_SPEED      = 28   chars / second   (~ 320 wpm scan; presentations skim)
  BASE_DWELL         = 0.45 s                (floor so even tiny events register)
  MIN_DWELL          = 0.30 s
  MAX_DWELL          = 12.0 s                (no single slide hogs forever)
  WEIGHT  = { text:1.0, thinking:0.6, code:0.35, tool_io:0.25, image:0 }
  IMAGE_COST         = 2.0 s  per image
  TOOL_IO_CAP        = 600 weighted-chars    (don't read a 5k-line file aloud)
  IDLE_THRESHOLD     = 20 s   (original gap above this is "idle")
  IDLE_COLLAPSED     = 0.8 s  (the compressed beat shown for a collapsed gap)
  MAX_REALTIME_GAP   = 10 s   (real-time mode clamp, FR-2)
  TOOL_SPAM_RUN      = 3      (≥3 same-name tool events ⇒ fold)
  SPAM_DWELL(k)      = BASE_DWELL + 0.5 * log2(k)   (sublinear in run length k)
  SEEK_STEP          = 5 s ;  speeds = [0.5,0.75,1,1.5,2,4,8]

renderedLength(event):                       # weighted "reading cost" in chars
  L = 0
  for block in event.content (tier-appropriate, post-redaction):  # FR-19
    n = visibleCharCount(block)              # text/code length; placeholder label len
    w = WEIGHT[block.type]
    if event.kind in {tool_use, tool_result}:
        n = min(n, TOOL_IO_CAP); w = WEIGHT.tool_io
    if block.type == image: L += IMAGE_COST * READING_SPEED   # convert to char-equiv
    else: L += n * w
  return L

dwellPresent(event):
  return clamp(BASE_DWELL + renderedLength(event)/READING_SPEED, MIN_DWELL, MAX_DWELL)

buildTimeline(session, mode, cfg):
  events = visibleEvents(session)            # tier-appropriate stream
  segs = []; t = 0; i = 0
  while i < events.length:
    e = events[i]
    # 1) fold tool-spam: run of same-name tool events
    run = sameNameToolRun(events, i)         # length k, k≥1
    if mode == present and run.kind == tool and run.length >= cfg.TOOL_SPAM_RUN:
        dwell = cfg.BASE_DWELL + 0.5*log2(run.length)
        segs.push({ start:t, dwell, events: run.slice, folded:true }); t += dwell
        i += run.length; continue
    # 2) per-event dwell
    if mode == present:
        dwell = dwellPresent(e)
    else:                                     # realtime
        gap = parseGap(e, prev)              # tsᵢ − tsᵢ₋₁, or NaN
        dwell = isFinite(gap) ? clamp(gap, MIN_DWELL, MAX_REALTIME_GAP)
                              : dwellPresent(e)   # FR-2 fallback
    # 3) collapse idle gap that PRECEDES this event (present mode)
    if mode == present and originalGapBefore(e) > cfg.IDLE_THRESHOLD:
        segs.push({ start:t, dwell:cfg.IDLE_COLLAPSED, idleMarker:true }); t += IDLE_COLLAPSED
    segs.push({ start:t, dwell, events:[e] }); t += dwell
    i += 1
  return { segs, totalMs: t*1000 }
```

**Design rationale (for Q-5):** dwell-∝-length with a `BASE` floor keeps short turns visible and long turns proportionate; type weights make code/tool output skim faster than prose because audiences scan them; `MAX_DWELL` caps any single beat; idle collapse turns minutes of human-thinking dead air into a marked 0.8s beat; sublinear `SPAM_DWELL(k)` keeps "ran Read ×30" from dragging while still signaling volume. Defaults are a *starting point to tune on real sessions* (a labeled set of recorded presentations) - see Open Questions. All knobs live in one config so tuning is a data change, not a code change.

### 6.4 Trade-offs
- **Virtual time vs. faithful time.** Presentation mode deliberately *distorts* real timing for watchability; real-time mode preserves it (clamped). The mode toggle and the "X min later" markers keep this honest/visible rather than silently lying about duration.
- **Typing effect.** Pleasant but risky (motion, perceived slowness, reduced-motion conflicts) - hence off by default, text-only, dwell-bounded, reduced-motion-disabled.
- **Memoization granularity.** Rebuild timeline only on (session, mode, pacingConfig) change; playhead moves are pure derivations - keeps scrubbing and speed changes allocation-free (FR-20).

## 7. Data model / API

No changes to the normalized `Session` (PRD-02 owns it). Playback-internal types only:

```ts
type PlaybackMode = 'realtime' | 'present';

interface Segment {
  start: number;          // virtual seconds
  dwell: number;          // virtual seconds
  events: SessionEvent[]; // 1, or a folded tool-spam run
  folded?: boolean;       // tool-spam fold (FR-12)
  idleMarker?: boolean;   // collapsed idle gap beat (FR-11)
}

interface Timeline {
  segs: Segment[];
  totalMs: number;
  eventToSeg: number[];   // event index -> segment index (jump-to-event, FR-8)
}

interface PacingConfig { /* the §6.3 constants, all optional w/ defaults */ }

interface PlaybackApi {
  play(): void; pause(): void; toggle(): void;
  seekMs(ms: number): void;                 // FR-7
  seekToEvent(index: number): void;         // FR-8
  step(dir: -1 | 1): void;                  // prev/next event
  setSpeed(s: number): void;                // FR-5
  setMode(m: PlaybackMode): void;
  setPacing(p: Partial<PacingConfig>): void;
}
```

**Deep-link params** (query string only, never the key fragment - §8): `play=1`, `mode=present|realtime`, `speed=1.5`, optional compact pacing overrides. Parsed defensively; unknown/invalid values fall back to defaults (never throw).

## 8. Security & privacy

Conforms to context §5; **introduces no new attack surface**.
- **No network during playback (FR-18).** Playback runs entirely on the already-decrypted in-memory model - no new fetches, no telemetry, nothing leaves the page. Verifiable in a network capture (mirrors ROADMAP success metric).
- **No new plaintext or keys.** Playback never decrypts anything; it consumes whatever PRD-05/06 already decrypted for the viewer's tier. The pacing heuristic reads only *rendered, tier-appropriate* content (FR-19), so timing cannot leak a hidden secret's true length - only its already-public type+length placeholder contributes.
- **Keys stay in the fragment.** Playback deep-link params live in the **query string**; they never read, write, or echo the `#<K_body>[.<K_secret>]` fragment, preserving §5.1 (keys never transmitted, never logged). The "strip-on-copy / warn" hygiene from PRD-05 is unaffected.
- **No persistence.** Playback state (playhead/speed/mode) is in-memory; nothing about session content is written to history, storage, or URL beyond the non-sensitive playback params the user opts into.
- **Risks introduced:** essentially none beyond UX (the "present" link distorting perceived timing - mitigated by visible mode + idle markers). Motion/animation accessibility risk is mitigated by FR-21/22.

## 9. Dependencies

**Upstream (must exist first):**
- [PRD-02](./PRD-02-parser-schema.md) - normalized `Session` with **ordered, timestamped** events (`ts` on `SessionEvent`); pacing's real-time mode and idle-gap detection consume these timestamps.
- [PRD-03](./PRD-03-viewer.md) - the renderer, component states, virtualization, and inline secret-placeholder rendering that playback reuses (FR-14–17, FR-20).
- [PRD-01](./PRD-01-design-system.md) - tokens (`--accent`, `--surface`, `--border`), motion guidelines, and Lucide icons for the transport bar.

**Sibling/contextual:**
- [PRD-05](./PRD-05-crypto-sharing.md) / [PRD-06](./PRD-06-secrets.md) - supply the *already-decrypted* model and tier-appropriate redaction that playback renders; playback adds nothing to their crypto.
- [PRD-04](./PRD-04-ingest.md) - provides the loaded local session for offline playback.

**Downstream:** none required for v1 (playback is a leaf delight feature). A potential "record to video" export (vNext) would build on this.

## 10. Acceptance criteria / DoD

- [ ] `buildTimeline(session, mode, cfg)` is a pure function with Vitest coverage over: missing/coarse/out-of-order timestamps (FR-2), presentation dwell formula (FR-9/10), idle collapse (FR-11), tool-spam fold (FR-12), and the `segment[i+1].start == segment[i].start + segment[i].dwell` invariant (FR-1).
- [ ] Transport bar matches §4.2: play/pause, prev/next, elapsed/total, scrubber with kind-colored ticks and collapsed-gap segments, speed selector, mode menu.
- [ ] Play/pause, drag/click seek, prev/next, and all seven speeds work and are frame-accurate (FR-3,5,6,7,8); seeking reveals the correct event set and snap-scrolls without replaying animation.
- [ ] Presentation mode visibly auto-paces, collapses idle gaps (with "N min later" markers), and folds same-name tool runs into "ran X ×k" (FR-11,12); changing pacing params (UI + deep link) re-paces live.
- [ ] Active-message highlight + smooth scroll-to-active work, reusing PRD-03 components with no render fork (FR-14,15,16); typing effect is opt-in, text-only, dwell-bounded (FR-17).
- [ ] Identical behavior for a local drop-in session and a decrypted shared session; **network capture during playback is empty** (FR-18); secrets render per tier and pacing uses only rendered content (FR-19).
- [ ] Smooth (≥ ~50 fps target) on a ≥ 5,000-event fixture; timeline built once and memoized; playhead changes don't rebuild (FR-20). Verified via a Playwright + performance smoke on the long-session fixture.
- [ ] `prefers-reduced-motion` disables typing/easing and uses instant scroll while keeping everything functional (FR-21); playback is always pausable/scrubbable; scrubber is an ARIA slider with value text (FR-22).
- [ ] Keyboard map (FR-23) works, is suppressed in text inputs, and is documented in an in-app `?` help.
- [ ] No changes to PRD-02 schema or PRD-05/06 crypto; deep-link params live in the query string and never touch the key fragment (§8).

## 11. Open questions

- **Q-5 (this PRD's charge) - pacing-heuristic specifics.** §6.3 proposes a concrete formula and a full default `PacingConfig` (reading speed 28 ch/s, type weights, idle-collapse at 20s→0.8s, tool-spam fold ≥3 with sublinear dwell). **Resolution path:** ship these as defaults behind a single typed config, then tune `READING_SPEED`, `IDLE_THRESHOLD`, and the type weights against a small labeled set of real recorded presentations before locking v1 numbers. Treat the numbers as data, not contract.
- **Q-5a - surface the param UI in v1, or ship sensible defaults only?** Leaning: ship a minimal "reading speed" slider + mode toggle in v1; expose the full pacing config via deep-link params for power users, keep the rest internal until validated.
- **Q-5b - ghosted "future events" preview during presentation?** A faint preview of upcoming events can aid orientation but adds motion/clutter. Leaning: off by default, evaluate after dogfooding.
- **Typing/streaming effect default.** Kept **off** for v1 (motion + perceived-slowness risk). Revisit if user testing finds it materially more engaging without hurting reduced-motion users.
- **Per-share saved tempo.** Should a sharer be able to *persist* a chosen mode/speed into the shared link's playback params so recipients open at the presenter's tempo? Leaning yes (query-string params already support it); confirm it never touches the key fragment.
- **(vNext) Record-to-video/GIF export.** Out of scope here; flagged so the timeline model is built export-friendly (deterministic `buildTimeline`) but no exporter ships in v1.

## 12. Phase / milestone

**Phase P4 - Playback** (ROADMAP §3). The delight layer, after the MVP (P1), sharing (P2), and secrets (P3) are in place. Build-order position per ROADMAP §3.1: **PRD-08 follows PRD-06**, before the launch PRD (PRD-09). Pure client-side; ships with no backend changes.
