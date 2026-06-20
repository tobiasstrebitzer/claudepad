# PRD-03 - Session Viewer & Prettified Render

> **Phase:** P1 (Local Prettify - MVP-0) · **Status:** Draft
> **Depends on:** [PRD-01](./PRD-01-design-system.md) (design system), [PRD-02](./PRD-02-parser-schema.md) (normalized `Session` model)
> **Consumed by:** [PRD-08](./PRD-08-playback.md) (playback wraps this renderer) · **Renders placeholders defined by:** [PRD-06](./PRD-06-secrets.md) · **Fed decrypted sessions by:** [PRD-11](./PRD-11-trustless-sharing.md)
> **Serverless-v1 note:** unchanged. The viewer renders a `Session` that is either locally parsed (offline) or decrypted client-side by PRD-11. When a high-priv recipient decrypts, the substituted `secretMap` arrives from PRD-11's client-side decrypt (not from any server). The viewer holds no keys and does no crypto.
> Read [`_context.md`](./_context.md) first; this PRD does not restate canonical facts (design tokens §4, security model §5, normalized model §6, template §7).

---

## 1. Summary & problem

A raw Claude Code session (`~/.claude/projects/*.jsonl`) is an unreadable wall of interleaved JSON. claudepad's core promise is "see it beautifully" - and PRD-03 is the component that delivers it. It takes a normalized `Session` (from PRD-02) and renders it as a calm, fast, readable transcript: distinct user/assistant turns, rendered markdown, syntax-highlighted code with copy, collapsible tool calls/results and thinking blocks, images, and session metadata. It is the heart of MVP-0 and must work **fully offline** - given a locally-parsed session, it renders with zero network and zero server. It is also the surface where redacted secret placeholders appear inline, and where a high-priv viewer's revealed values render (with a re-hide toggle). Everything is built on PRD-01's design system; nothing here re-invents tokens or primitives.

## 2. Goals / Non-goals

### Goals
- Render any normalized `Session` into a readable, warm-minimal transcript with clear user/assistant distinction.
- Markdown rendering, syntax-highlighted code blocks with copy-to-clipboard, collapsible tool calls/results (including error states), collapsible thinking blocks, image/attachment display.
- Surface session metadata (title, model, cwd, timestamps) in a compact, scannable header.
- Stay smooth and responsive on **very long** sessions (thousands of events) via list virtualization/windowing.
- Work **fully offline** - no network requests required to render a locally-parsed session.
- Render secret placeholders per `_context.md` §5.3 (`[AWS_KEY ••••••••(20)]`) and, when a high-priv viewer supplies the secret map, substitute real values with a global + per-secret re-hide toggle.
- Provide navigation for long sessions: anchored/linkable messages, a table-of-contents / minimap.
- Handle empty, loading, and error states gracefully; never crash on unknown/malformed content blocks (degrade per §6 principle).
- Responsive from mobile to wide desktop.

### Non-goals
- **Parsing** - owned by PRD-02. The viewer consumes an already-normalized `Session`.
- **Secret detection / the secret map structure** - owned by PRD-06. The viewer only *renders* placeholders and substitutes a provided secret map; it does not scan or build it.
- **Encryption / decryption / key transport** - owned by PRD-05. The viewer receives a plaintext `Session` (and an optional already-decrypted secret map) from upstream.
- **Ingest (drop/paste/CLI)** - owned by PRD-04.
- **Playback / timeline scrubbing / auto-pacing** - owned by PRD-08; it reuses this renderer but the time machinery is out of scope here.
- **Editing** the session. The viewer is read-only.
- **Server-side rendering or search.** Rendering is client-side only (zero-knowledge baseline §5.1).

## 3. Personas & user stories

- **As a sharer**, I want to see my session rendered cleanly before I share it, so that I can confirm it reads well and looks the way I want.
- **As a low-priv viewer**, I want to read the full conversation with secrets shown as labeled placeholders, so that I get the context without seeing live credentials.
- **As a high-priv viewer**, I want revealed secret values inline (because my link carried `K_secret`), with a one-click way to re-hide them, so that I can shoulder-surf-safely toggle sensitive values.
- **As any viewer**, I want to collapse the noisy parts (long tool output, thinking, large code) and jump around via a table of contents, so that a long session stays navigable.
- **As any viewer**, I want to deep-link to a specific message and have it scroll into view + highlight, so that I can point a teammate at the exact turn.
- **As a self-hoster / offline user**, I want the viewer to work with no network at all, so that I can audit/use it air-gapped.
- **As a viewer on a phone**, I want a layout that reflows to a single column and stays readable.

## 4. UX & flows

### 4.1 Overall layout (wide desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ┌── Session header ──────────────────────────────────────────────────────┐   │
│  │  Refactor the auth module                        [Strict ZK]  ⟨secrets⟩ │   │
│  │  ◆ claude-opus-4-…   ⌂ ~/projects/app   ◷ 2026-06-18 14:02 · 38 min     │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│ ┌── TOC / minimap ─┐ ┌── Transcript (virtualized scroll) ───────────────────┐  │
│ │ ▸ User: refac…   │ │  ┌─ user ─────────────────────────────────────────┐  │  │
│ │ ▸ Asst: Sure…    │ │  │ Can you refactor the auth module to use…       │  │  │
│ │   ⚙ Read(auth.ts)│ │  └────────────────────────────────────────────────┘  │  │
│ │ ▸ Asst: Done…    │ │  ┌─ assistant · claude-opus-4 ───────────────────┐  │  │
│ │   ⚙ Edit(auth.ts)│ │  │ Sure. Here's the plan…  (rendered markdown)    │  │  │
│ │ ▸ User: ship it  │ │  │ ▸ 🧠 Thinking (collapsed)                       │  │  │
│ │       ·          │ │  │ ▾ ⚙ Read  auth.ts                      [error] │  │  │
│ │  (scroll rail) ▒ │ │  │      └ result ▸ (collapsed, 412 lines)         │  │  │
│ └──────────────────┘ │  └────────────────────────────────────────────────┘  │  │
│                      └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Header** (sticky): title (serif display, sparingly per §4), model badge, cwd, start time + duration, mode chip, and - only when a secret map is present - a `⟨secrets⟩` reveal/hide control.
- **Left rail**: table-of-contents / minimap of turns; current viewport highlighted; click to jump. Collapsible; hidden on narrow viewports behind a toggle.
- **Main column**: the virtualized transcript.

### 4.2 Turn anatomy

```
USER turn                              ASSISTANT turn
┌────────────────────────────┐        ┌──────────────────────────────────────┐
│ ▸ user            14:02 #u3│        │ ◆ assistant · opus-4      14:03 #a7  │  ← anchor id + ts
│ ─────────────────────────  │        │ ──────────────────────────────────── │
│ markdown / text…           │        │ markdown… with `inline code`         │
│ [AWS_KEY ••••••••(20)]     │        │ ```ts  (highlighted, [copy])  ```    │
└────────────────────────────┘        │ ▸ 🧠 Thinking            (collapsed) │
  warm beige surface, left-aligned    │ ▾ ⚙ Edit  src/auth.ts       [copy]   │
  subtle left accent rule              │     input  { … }      (collapsible)  │
                                       │   ↳ result  ✓ 1 file changed         │
                                       └──────────────────────────────────────┘
                                         white surface, clay ◆ marker
```

User and assistant turns are visually distinct via **surface color, alignment cue, and role marker** (not color alone - for accessibility). User = soft beige surface (`--sidebar`); assistant = white surface (`--surface`) with a clay `◆` role marker. Each turn carries a stable anchor id and a timestamp.

### 4.3 Collapsible blocks

```
Tool call (collapsed default for results, expanded for the call summary):
  ▾ ⚙ Bash   npm test                                          [copy] [#t12]
     input ▸  { command: "npm test", timeout: 120000 }        (collapsed)
     ↳ result ▾  ✗ error                                       (auto-expanded)
        ┌──────────────────────────────────────────────────┐
        │ FAIL  src/auth.test.ts                            │  ← danger-tinted
        │   ● expected 200, received 401                    │     left border
        └──────────────────────────────────────────────────┘

Thinking block (collapsed by default):
  ▸ 🧠 Thinking  (823 words)                                   [#k4]
```

- **Tool calls** (`tool_use`): header shows tool name + a one-line summary of key input (e.g. the command, the file path). Input JSON and the matched `tool_result` are collapsible. Tool name + summary is always visible; bodies collapse.
- **Tool results** (`tool_result`): rendered under their originating call when correlatable (by `forName` / ordering per PRD-02); **error results** (`isError: true`) get a danger-tinted treatment and are **auto-expanded** so failures aren't hidden. Large outputs are collapsed with a line/char count and "show more".
- **Thinking blocks**: collapsed by default, labeled with a word count; expand to read.
- A header control offers **Expand all / Collapse all** (and per-type: collapse all thinking / all tool I/O).

### 4.4 Secret placeholder rendering (per `_context.md` §5.3, PRD-06)

```
Low-priv (no secret map):     deploy with key [AWS_KEY ••••••••(20)]
High-priv, hidden (default):  deploy with key [AWS_KEY ••••••••(20)]   ⟨reveal⟩
High-priv, revealed:          deploy with key ⟨AKIA…REALVALUE…⟩  ⟨hide⟩
```

- A placeholder renders as a non-breaking inline chip: `[<TYPE> ••••••••(<len>)]` using mono font, muted surface, never wrapping mid-chip. The dot count is fixed (8) for visual rhythm; the real length is the `(len)` number. **No prefix/hash of the real value is ever shown** (§5.3).
- When **no** secret map is present (low-priv, or local session with secrets), only the placeholder is shown; there is no reveal affordance (nothing to reveal).
- When a secret map **is** present (high-priv link decrypted by PRD-05, passed in), each placeholder gains a hover/inline `⟨reveal⟩` control, and the header `⟨secrets⟩` control offers **Reveal all / Hide all**. Revealed values render in a distinct clay-bordered chip so it's visually obvious a live value is on screen. A re-hide returns to the placeholder. Default state is **hidden** even for high-priv (shoulder-surf safety, §5.7).
- Placeholders that have no entry in the provided secret map (map is partial/stale) stay as placeholders and never error.

### 4.5 States

```
LOADING                 EMPTY                       ERROR (whole session)
┌────────────────┐      ┌──────────────────────┐    ┌───────────────────────────┐
│  ◌ rendering…  │      │  Nothing to show yet │    │  ⚠ Couldn't render this   │
│  ▒▒▒▒  skeleton│      │  Drop a .jsonl to    │    │  session.                 │
│  ▒▒▒▒▒▒        │      │  get started → PRD-04│    │  [Show raw]  [Report]     │
└────────────────┘      └──────────────────────┘    └───────────────────────────┘
```

- **Loading:** skeleton turns (not a spinner-only screen) while a large session mounts/virtualizes.
- **Empty:** a calm empty state (hands off to PRD-04's ingest entry points; the viewer itself just shows the empty affordance).
- **Per-block error:** an individual malformed/unknown block renders a graceful inline fallback ("Unrecognized content - show raw") rather than crashing the transcript.
- **Whole-session error:** only if the `Session` object itself is unusable; offers "show raw" escape hatch.

### 4.6 Deep-link / anchor flow

`…/view#…&msg=a7` (the `msg` selector lives outside the crypto fragment payload; see §7) → on load, scroll the message into view, briefly highlight it, and reflect the current anchor in the URL as the user scrolls or clicks a turn's `#id`.

## 5. Functional requirements

Each is testable. "MUST" = required for MVP-0; "SHOULD" = strongly desired in P1.

### Rendering core
- **FR-1** The viewer MUST accept a normalized `Session` (per `_context.md` §6 / PRD-02) as input and render its `events` in order.
- **FR-2** It MUST render `user` and `assistant` events as visually distinct turns, distinguished by **at least two** independent cues (surface/background, alignment or role marker, and an accessible role label) - not color alone.
- **FR-3** `text` content blocks MUST be rendered as **Markdown** (headings, lists, links, blockquotes, inline code, tables, task lists), sanitized so no embedded HTML/script executes.
- **FR-4** `code` content blocks (and fenced code inside markdown) MUST be **syntax-highlighted** by `lang` when known, rendered in mono, and degrade to plain mono when `lang` is unknown/absent.
- **FR-5** Every code block MUST have a **copy button** that copies the exact original text (not the highlighted markup) to the clipboard, with a transient "copied" confirmation.
- **FR-6** `image` content blocks MUST render the referenced image inline (resolving `ref` against locally-available data) with a sensible max size and click-to-zoom; a broken/missing `ref` MUST show a non-crashing placeholder.
- **FR-7** `raw` / unknown content blocks (and any unrecognized event `kind`, e.g. `meta`) MUST render a graceful, collapsible "unrecognized content - show raw JSON" fallback and MUST NOT crash the transcript (per §6 principle).

### Tool calls, results, thinking
- **FR-8** `tool_use` events MUST render with the tool `name` always visible plus a one-line summary derived from `input` (e.g. command, primary file path); the full `input` MUST be collapsible.
- **FR-9** `tool_result` events MUST be associated with their originating `tool_use` where correlatable (via `forName`/ordering from PRD-02) and rendered as a nested result; uncorrelated results MUST still render standalone.
- **FR-10** Tool results with `isError: true` MUST be visually marked as errors (danger treatment) and **auto-expanded**.
- **FR-11** Large tool inputs/outputs MUST be collapsed by default with a size indicator (lines/chars) and a "show more"/expand control.
- **FR-12** `thinking` events MUST render **collapsed by default**, labeled (e.g. word/char count), and expandable.
- **FR-13** The header MUST provide **Expand all / Collapse all** controls, and SHOULD provide per-type bulk toggles (all thinking, all tool I/O).

### Metadata & navigation
- **FR-14** The viewer MUST render a session header with, when present: `meta.title`, `meta.model`, `meta.cwd`, `meta.startedAt` (formatted, with relative/absolute on hover), and a derived duration when end time is derivable. Absent fields MUST be omitted gracefully (no "undefined").
- **FR-15** Each turn (and each significant block) MUST have a **stable anchor id**; a per-turn affordance MUST let the user copy a deep link to it.
- **FR-16** Visiting a URL with a message anchor MUST scroll that message into view and briefly highlight it on load.
- **FR-17** As the user scrolls/selects, the URL anchor SHOULD update to reflect the current/selected turn without polluting browser history (replace, not push, on scroll).
- **FR-18** The viewer MUST provide a **table-of-contents / minimap** of turns enabling jump-to; the current viewport position MUST be indicated; it MUST be collapsible and auto-hidden on narrow viewports.

### Secrets (rendering only; detection/envelope per PRD-06)
- **FR-19** Secret placeholder tokens in content MUST render as inline mono chips in the form `[<TYPE> ••••••••(<len>)]`, never wrapping mid-chip, and MUST NOT display any prefix, hash, or substring of the real value (§5.3).
- **FR-20** When **no** secret map is supplied, placeholders MUST render with **no** reveal affordance.
- **FR-21** When a secret map **is** supplied, the viewer MUST default to **hidden** (placeholders shown), MUST offer per-placeholder reveal/hide and a header-level Reveal all / Hide all, and revealed values MUST render in a visually distinct (clay-bordered) chip.
- **FR-22** Placeholders with no matching entry in a (partial/stale) secret map MUST remain placeholders and MUST NOT error.

### Performance, states, responsiveness
- **FR-23** The transcript MUST use **list virtualization/windowing** so that only on-screen (plus a small buffer) turns are mounted; it MUST stay interactive (scroll, expand) on a session with **≥ 5,000 events**.
- **FR-24** Initial time-to-first-paint of the transcript MUST be bounded (skeleton shown immediately; first turns interactive) regardless of total session size, with a documented target (see §10).
- **FR-25** The viewer MUST render **fully offline** - zero network requests are required to render a locally-parsed session (fonts, highlighter, all assets bundled/inlined). This MUST be verifiable with the network blocked.
- **FR-26** The viewer MUST handle and display distinct **loading**, **empty**, and **error** states per §4.5.
- **FR-27** The layout MUST be responsive: single readable column on mobile (TOC behind a toggle), two-pane on wide viewports; no horizontal overflow except inside scrollable code/result regions.
- **FR-28** The viewer MUST meet baseline a11y: semantic roles for turns, keyboard-operable collapse/expand/copy/TOC controls, visible focus, and color-contrast per PRD-01 tokens; expand/collapse state MUST be exposed via `aria-expanded`.

## 6. Technical design

### 6.1 Module structure
A self-contained, presentational package consuming shared types from PRD-02. Suggested layout (monorepo `packages/`, per §3 conventions):

```
packages/viewer/
  SessionViewer.tsx        // top-level: header + TOC + virtualized transcript; takes { session, secretMap? }
  components/
    SessionHeader.tsx      // title, model, cwd, time, mode chip, secrets control
    TableOfContents.tsx    // minimap / jump nav, viewport tracking (IntersectionObserver)
    TranscriptList.tsx     // virtualization host
    turns/
      UserTurn.tsx
      AssistantTurn.tsx
      ThinkingBlock.tsx    // collapsed-by-default
      ToolCall.tsx         // name + summary + collapsible input
      ToolResult.tsx       // correlated/standalone, error-aware, auto-expand on error
      MetaBlock.tsx        // graceful unknown-event fallback
    blocks/
      Markdown.tsx         // sanitized markdown -> with SecretText + CodeBlock renderers
      CodeBlock.tsx        // highlight + copy
      ImageBlock.tsx       // inline + zoom + broken-ref fallback
      RawBlock.tsx         // show-raw-JSON fallback
      SecretText.tsx       // placeholder chip + reveal/hide
  hooks/
    useReveal.ts           // global + per-secret reveal state, default hidden
    useAnchor.ts           // deep-link scroll + URL sync (replaceState)
    useCorrelateTools.ts   // pair tool_use <-> tool_result
  state/revealStore.ts     // Zustand (light) for reveal + expand-all state
```

The package exports a single `<SessionViewer session={…} secretMap={…} />`. PRD-08 (playback) wraps the same components, driving which events are visible over time; so turn components MUST be pure functions of their event + render flags and avoid owning playback/time state.

### 6.2 Key libraries & trade-offs
- **Virtualization:** `@tanstack/react-virtual` (variable/measured row heights - turns differ wildly in height as blocks expand/collapse). Trade-off vs. fixed-height windowing: dynamic measurement is required because expanding a tool result changes row height; we accept the re-measure cost. Anchor scrolling (FR-16) must use the virtualizer's `scrollToIndex`/offset, since target turns may be unmounted.
- **Markdown:** `react-markdown` + `remark-gfm` (tables/task lists/strikethrough) with **`rehype-sanitize`** (strict schema). Custom renderers inject `CodeBlock` for fenced code and `SecretText` for placeholder tokens. We do **not** allow raw HTML (security + sanity).
- **Syntax highlighting:** **Shiki** (preferred for fidelity) with a **bundled, offline** theme + a curated language subset to keep the static bundle reasonable; fall back to plaintext for unlisted langs. Alternative considered: `highlight.js`/`prism` (smaller, lower fidelity). Highlighting runs lazily per visible block to avoid blocking first paint; large blocks may be highlighted off the main thread (worker) or capped. **All grammars/themes bundled - no CDN** (FR-25).
- **Placeholder substitution:** placeholders are matched as a token pattern *after* markdown parsing, at the text-node level in `SecretText`, so a placeholder spanning rendering boundaries still renders as one chip and a revealed value can't smuggle markdown/HTML (revealed values render as inert text, never re-parsed as markdown). See §8.
- **State:** light Zustand store for cross-cutting UI state (reveal-all, expand-all); local component state for per-block collapse. No data layer.

### 6.3 Tool correlation
PRD-02 emits `tool_use` and `tool_result` (with optional `forName`) as ordered events. `useCorrelateTools` produces, in a single pass, a render plan that nests each `tool_result` under its preceding matching `tool_use`; unmatched results render standalone (FR-9). Correlation is rendering-time only and never mutates the `Session`.

### 6.4 Offline guarantee
Fonts (PRD-01), the Shiki theme/grammars, and all icons are bundled into the static build (no Google Fonts CDN, no runtime fetch). Images use locally-available data (object URLs / data URIs resolved from the ingest layer); the viewer never fetches a remote `ref`. This keeps the single-static-bundle packaging goal (§3) intact and is asserted by a Playwright test with the network blocked (FR-25).

### 6.5 Performance approach
- Virtualize the top-level turn list (FR-23).
- Defer expensive work: collapsed thinking/tool bodies are **not** highlighted/rendered until expanded.
- Lazy/limited highlighting for visible code; cap extremely large single blocks with "show more" (FR-11).
- Memoize turn renders keyed by event identity + render flags so scroll re-renders are cheap.

## 7. Data model / API

### 7.1 Component contract (no network API; this is a client component)
```ts
type SecretMap = Record<string, { type: string; value: string }>; // from PRD-06 via PRD-05 (already decrypted)

interface SessionViewerProps {
  session: Session;               // normalized, from PRD-02 (_context.md §6)
  secretMap?: SecretMap;          // present only for high-priv; absent => no reveal affordance
  initialAnchor?: string;         // e.g. "a7" to scroll-to on mount
  options?: {
    defaultCollapse?: { thinking?: boolean; toolIO?: boolean }; // defaults: thinking collapsed, tool input collapsed, error results expanded
    showToc?: boolean;            // default true on wide viewports
    onAnchorChange?: (id: string) => void; // lets host sync URL (FR-17)
  };
}
```

### 7.2 Placeholder token shape (rendering contract with PRD-06)
The viewer renders whatever opaque-ID placeholder token PRD-06 embeds in `text` content. Rendering only needs the **id**, **type label**, and **length** - exposed in the token so the chip `[<TYPE> ••••••••(<len>)]` can render *without* the secret map. PRD-06 owns the exact serialized form; the viewer's contract is:
```ts
// Conceptual; PRD-06 owns the canonical token format.
type SecretPlaceholder = { id: string; type: string; len: number };
// Reveal: secretMap[id]?.value  (absent => stays a placeholder, FR-22)
```

### 7.3 URL anchor convention
A message anchor (`msg=<id>`) is **non-secret** and lives in normal query/hash params *outside* the crypto key payload, so deep-linking to a turn never touches `K_body`/`K_secret` (§5). PRD-05 owns the fragment layout; this PRD only requires that a turn id can be expressed in the URL and consumed via `initialAnchor`.

## 8. Security & privacy

Conforms to `_context.md` §5 (this is a render surface, not a crypto surface):
- **Zero-knowledge preserved (§5.1):** rendering is entirely client-side; the viewer makes no server calls to render (FR-25). It never transmits session content or keys anywhere.
- **No reveal without the key (§5.2):** the viewer can only show real secret values when a `secretMap` is passed in - which only happens when PRD-05 decrypted `K_secret` from a high-priv link. The viewer holds no keys and performs no decryption itself.
- **Placeholder discipline (§5.3):** chips show **type + length only**, never a hash/prefix/substring of the real value (FR-19). The dot count is cosmetic and fixed; the real length is a number.
- **Shoulder-surf mitigation (§5.7):** even high-priv defaults to **hidden**; revealing is explicit and reversible (FR-21), and revealed values are visually flagged so a user knows a live credential is on screen during a screen-share.
- **XSS / injection safety:** all markdown is sanitized with a strict schema; **no raw HTML** is rendered; code is highlighted as text; **revealed secret values are rendered as inert text and never re-parsed as markdown/HTML** - so a secret value that looks like `<img onerror=…>` cannot execute. Image `ref`s resolve only to local data, never arbitrary remote URLs.
- **Clipboard:** copy actions write only what the user expects (raw code, or a deep link). Revealed-secret copy, if offered, is an explicit per-value action (decision flagged in §11).
- **Risks introduced:** (1) a missed secret left in plaintext by PRD-06 renders verbatim to all tiers - the viewer cannot detect this; it is mitigated upstream by the mandatory review UI (§5.4, PRD-06). (2) Anchor ids in the URL are non-secret but could reveal that a session *exists*; acceptable and unrelated to content confidentiality.

## 9. Dependencies

**Upstream (required):**
- **PRD-01** - design tokens, typography, shadcn/base primitives, icons, motion. The viewer composes these; it defines no new tokens.
- **PRD-02** - the normalized `Session` model and tool-correlation hints (`forName`). The viewer is a pure consumer.

**Cooperating / contract partners:**
- **PRD-06** - owns secret detection, the secret-map structure, and the placeholder token format. PRD-03 owns *rendering* of placeholders and reveal/hide UX. **Contract:** placeholder token exposes `{id, type, len}` (§7.2).
- **PRD-05** - supplies the already-decrypted `secretMap` (high-priv only) and owns URL-fragment layout; PRD-03 consumes `secretMap` + `initialAnchor`.

**Downstream (consumers):**
- **PRD-08** - playback wraps this renderer, driving event visibility over time. PRD-03's turn components must stay pure/time-agnostic (§6.1) so PRD-08 can layer timing on top.
- **PRD-04** - ingest provides the `Session` (and local image data) and the empty-state entry points the viewer hands off to.

## 10. Acceptance criteria / Definition of Done

- [ ] `<SessionViewer>` renders a fixture `Session` with user/assistant turns visually distinguished by ≥2 cues (FR-1, FR-2).
- [ ] Markdown (incl. GFM tables/task lists) renders sanitized; no HTML/script executes from session content (FR-3, §8).
- [ ] Code blocks are highlighted, copy-to-clipboard copies exact source, "copied" confirmation shows (FR-4, FR-5).
- [ ] Images render inline with zoom; broken `ref` shows a non-crashing placeholder (FR-6).
- [ ] Unknown content blocks / event kinds render a "show raw" fallback and never crash; verified against a malformed fixture (FR-7).
- [ ] Tool calls show name + summary; input collapsible; results correlated and nested; error results danger-styled and auto-expanded; large bodies collapsed with size indicator (FR-8–FR-11).
- [ ] Thinking blocks collapsed by default with a count; expand/collapse-all works (FR-12, FR-13).
- [ ] Header shows title/model/cwd/time/duration when present, omits absent fields cleanly (FR-14).
- [ ] Deep-linking to a turn scrolls + highlights it; scrolling updates the URL via replaceState (FR-15–FR-17).
- [ ] TOC/minimap jumps to turns, tracks viewport, collapses on narrow screens (FR-18).
- [ ] Placeholders render as `[TYPE ••••••••(len)]`, no value substring; no reveal affordance without a secret map (FR-19, FR-20).
- [ ] With a secret map: default hidden; per-placeholder + reveal-all/hide-all work; revealed chips visually distinct; partial map degrades gracefully (FR-21, FR-22).
- [ ] A **≥5,000-event** fixture scrolls and expands smoothly via virtualization; skeleton shows immediately (FR-23, FR-24). **Targets:** transcript interactive < 1s after `Session` is provided regardless of size; scroll stays ≥ ~50fps on the perf fixture (target, to be benchmarked).
- [ ] Renders with **network fully blocked** (Playwright offline test) - fonts, highlighter, icons all local (FR-25).
- [ ] Loading / empty / error states render per §4.5 (FR-26).
- [ ] Responsive: single column on mobile, two-pane wide, no stray horizontal overflow (FR-27).
- [ ] A11y: keyboard-operable controls, focus visible, `aria-expanded` on collapsibles, contrast per PRD-01 (FR-28).
- [ ] Vitest unit tests cover correlation, placeholder rendering/reveal logic, and graceful-degradation fallbacks; Playwright covers the offline render + deep-link + reveal flows (§3 testing).

## 11. Open questions

1. **Tool-result correlation fidelity.** Does PRD-02 guarantee a reliable `tool_use`↔`tool_result` link (stable id, not just `forName`/ordering)? If correlation is ambiguous (parallel tool calls, interleaving), the viewer needs a documented tie-break rule. → Confirm the correlation contract with PRD-02.
2. **Copying revealed secrets.** Should a revealed secret offer a copy button, or is that an unacceptable exfil/shoulder-surf risk? Leaning **no copy by default** (or an extra confirm), but this is a security/UX call shared with PRD-06.
3. **Highlighter footprint.** Shiki's grammars/themes inflate the single static bundle (§3 packaging goal). Need a decision on the bundled language subset vs. fidelity, and whether to highlight in a web worker for very large blocks.
4. **Image `ref` resolution.** Exact handoff for local image data (object URL vs. data URI vs. embedded base64 in the `Session`) is shared with PRD-04/PRD-02 - and affects the offline guarantee and bundle/memory size for image-heavy sessions.
5. **Duration / end-time.** `meta` has `startedAt` but no explicit end. Derive duration from the last event ts, or leave duration out when unknown? (Currently: derive when derivable, omit otherwise - confirm with PRD-02 what's reliably present.)
6. **Minimap density on huge sessions.** A literal per-turn minimap may itself be too tall for 5,000 events; may need a density-reduced / sampled minimap or a sectioned TOC. → UX decision pending the perf fixture.
7. **Anchor stability across re-parses.** If PRD-02 re-parses the same source, are turn ids stable enough that shared deep links survive a parser version bump? → Coordinate id-derivation with PRD-02/PRD-05.

## 12. Phase / milestone

**Phase P1 - Local Prettify (MVP-0)** per [`ROADMAP.md`](../ROADMAP.md) §3. PRD-03 is the read experience at the center of MVP-0 (Drop/paste → see it beautifully, fully offline, no server, single static page) and the critical path: PRD-01 → PRD-02 → **PRD-03** → PRD-04. It is later reused by PRD-08 (Playback, P4) and renders the placeholders produced by PRD-06 (Secrets, P3) and decrypted by PRD-05 (Sharing, P2).
