# PRD-01 — Design System & UI Foundation

> **Phase:** P0 (Foundation) · **Status:** Draft · **Owner PRD for:** visual identity, design tokens, component primitives, app shell, motion, a11y baseline.
> Canonical context: [`_context.md`](./_context.md) (tech stack §3, design tokens §4, template §7). This PRD implements §4; if it ever conflicts with §4, §4 wins.

---

## 1. Summary & problem

claudepad needs one shared visual language before any user-facing surface is built. Without a token system, type scale, and component foundation, PRD-03 (viewer), PRD-04 (ingest), PRD-06 (secret review), and PRD-08 (playback) would each invent their own spacing, colors, and primitives — producing drift, accessibility gaps, and rework. This PRD establishes claudepad's **warm-minimal identity** (paige/white canvas, clay-orange spark, serif display + clean sans + mono), a CSS-variable token architecture with light as default and dark as a token swap, the shadcn/ui-on-Base-UI + Tailwind wiring, motion and accessibility baselines, the app-shell layout, and a **living component gallery** that doubles as the visual contract. The result is a recognizably-claudepad identity in the same family as the Anthropic reference, without reusing Anthropic's mark, asterisk, or proprietary fonts.

## 2. Goals / Non-goals

### Goals
- Implement the §4 palette and typography as a **CSS-variable token system** consumed through Tailwind, with semantic (not raw-hex) component usage.
- Ship **light as default**, **dark as a pure token swap** (warm dark, never `#000`), switchable with no component changes.
- Wire **shadcn/ui on Base UI primitives + Tailwind** and define the exact primitive set v1 adopts.
- Define a **distinct claudepad wordmark/mark** direction (its own identity; not Anthropic's asterisk/logo/fonts).
- Define **spacing, radii, border, shadow, iconography (Lucide), and motion** conventions as enforceable tokens.
- Meet a **WCAG 2.1 AA** contrast and focus-visibility baseline for every token pairing and primitive.
- Deliver a **living component gallery page** (`/gallery`) that renders every token and primitive in light + dark.
- Resolve **Q-1** (single static bundle vs. SPA) from the design-foundation angle and constrain downstream PRDs accordingly.

### Non-goals
- Building the actual viewer, ingest, secret-review, or playback **screens** (PRD-03/04/06/08 own those; this PRD provides their parts).
- Final copywriting, marketing site, or illustration system.
- Animations beyond foundational motion tokens (rich playback transitions are PRD-08).
- A fully theme-able multi-brand system — claudepad ships **one brand**, two color modes.
- Internationalization / RTL (acknowledged as future; tokens must not preclude it).

## 3. Personas & user stories

- **As a frontend contributor (PRD-03/04/06/08 implementer)**, I want a documented token set and ready primitives so that I compose screens without inventing colors, spacing, or focus styles.
- **As the Sharer (end user)**, I want a calm, fast, legible interface so that reading and reviewing a session feels effortless and trustworthy.
- **As a self-hoster / auditor**, I want the UI to build into a small, inspectable static bundle so that I can verify nothing phones home and the design layer adds no runtime surprises.
- **As a low-vision or keyboard user**, I want AA contrast and a visible focus ring on every interactive element so that I can navigate without a mouse and read every label.
- **As a designer/reviewer**, I want a single gallery page rendering all tokens and components in both themes so that regressions are caught visually in one place.

## 4. UX & flows

### 4.1 App-shell layout (sidebar + main canvas)

Inspired by the reference (left sidebar, generous canvas, serif greeting) but distinct: claudepad's sidebar is **session-centric**, the canvas centers on **transcript reading**, and the accent appears only as a spark (active item, primary action, focus).

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ┌────────────────────┐  ┌──────────────────────────────────────────────┐   │
│  │  SIDEBAR (--sidebar)│  │  MAIN CANVAS (--bg)                          │   │
│  │  width 260px        │  │                                              │   │
│  │  ┌────────────────┐ │  │   ┌──────── TOPBAR (h-14, hairline btm) ───┐ │   │
│  │  │ ◆ claudepad    │ │  │   │  Session title        [Share] [Theme] │ │   │
│  │  │   (wordmark)   │ │  │   └────────────────────────────────────────┘ │   │
│  │  ├────────────────┤ │  │                                              │   │
│  │  │ + New / Open   │ │  │   ┌──── CONTENT (max-w 768px, centered) ──┐  │   │
│  │  │   (primary)    │ │  │   │                                        │  │   │
│  │  ├────────────────┤ │  │   │   Afternoon, Toby   ← serif display    │  │   │
│  │  │ RECENT         │ │  │   │                                        │  │   │
│  │  │  • session a   │◀┼──┼───┼── active item: accent left-bar + tint │  │   │
│  │  │  • session b   │ │  │   │                                        │  │   │
│  │  │  • session c   │ │  │   │   [ transcript / panel content ]       │  │   │
│  │  │   …            │ │  │   │                                        │  │   │
│  │  ├────────────────┤ │  │   └────────────────────────────────────────┘  │   │
│  │  │ TS  Tobias …   │ │  │                                              │   │
│  │  │     self-host  │ │  │                                              │   │
│  │  └────────────────┘ │  │                                              │   │
│  └────────────────────┘  └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar** (`--sidebar`, 1px right hairline `--border`): wordmark top, primary "New / Open" action, a `RECENT` list (active item marked by a 2px `--accent` left-bar + faint `--accent-tint` row), and a footer identity/self-host badge.
- **Main canvas** (`--bg`): a top bar (h-14, bottom hairline) carrying contextual title + actions; content column **centered, `max-w-3xl` (768px)** for reading comfort, with serif used sparingly for the hero/section greeting.
- **Responsive collapse:** below `md` (768px) the sidebar collapses to an off-canvas drawer (Base UI Dialog/Drawer); a top-left menu button toggles it. Canvas goes edge-to-edge with `px-4` gutters.

```
  Mobile (<768px)
  ┌──────────────────────────┐
  │ ☰  ◆ claudepad   [Theme] │  ← topbar; ☰ opens drawer
  ├──────────────────────────┤
  │  Afternoon, Toby         │
  │                          │
  │  [ content, px-4 ]       │
  │                          │
  └──────────────────────────┘
```

### 4.2 Theme-switch flow
1. User clicks the theme toggle (topbar). 2. `data-theme` flips on `<html>` between `light`/`dark` (or `system`). 3. All surfaces re-render purely from swapped CSS variables — **no component logic runs**. 4. Choice persists to `localStorage` (`claudepad.theme`); default = `system`, resolving to light when undetectable.

### 4.3 Gallery flow
A developer opens `/gallery` and sees every token swatch, type specimen, icon set, and primitive (in default + interaction states) rendered live, with a light/dark switch at the top. This is the visual acceptance surface for this PRD and the reference for all downstream PRDs.

## 5. Functional requirements

Numbered, testable.

### Tokens & theming
- **FR-1** A single token stylesheet (`src/styles/tokens.css`) MUST define all design tokens as CSS custom properties under `:root` (light) and `[data-theme="dark"]`, covering every row in §4 plus the derived tokens in §7.1.
- **FR-2** Tailwind config MUST map semantic token names (e.g. `bg-bg`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-accent`, `text-accent`) to the CSS variables, so component code references **semantic names, never raw hex**.
- **FR-3** Switching theme MUST be achievable by toggling a single `data-theme` attribute on `<html>` with **no JavaScript re-computation of component styles** and no component code change. (Test: snapshot the gallery, flip attribute, assert no DOM structure diff, only computed-style diff.)
- **FR-4** Default theme MUST be light; `system` MUST be supported and persisted to `localStorage["claudepad.theme"]`; an unset/unknown value MUST resolve to light.
- **FR-5** Dark theme MUST use a **warm dark** background (token `--bg` ≈ `#1A1917`, not `#000000`) and MUST keep the clay accent recognizable (adjusted for contrast, see §7.1).
- **FR-6** No component or screen in this or downstream PRDs may hardcode a color hex; a lint/CI check MUST flag raw hex in `src/**/*.{tsx,css}` outside `tokens.css`.

### Typography
- **FR-7** Three font roles MUST be defined as tokens — `--font-serif` (display), `--font-sans` (UI/body), `--font-mono` (code) — using self-hosted, OFL/open-licensed fonts (see §6.4), with no runtime fetch from third-party font CDNs (zero-knowledge / no-phone-home posture).
- **FR-8** A type scale (§7.2) MUST be implemented as Tailwind text utilities; the serif role MUST be restricted to display/heading usage and MUST NOT be applied to transcript body or UI controls.
- **FR-9** Body and mono text MUST meet AA contrast (≥ 4.5:1) against their default surface in both themes; large display text MUST meet ≥ 3:1.

### Primitives & components
- **FR-10** shadcn/ui MUST be configured to generate components on **Base UI** primitives (per §3 of `_context.md`) and styled with the token-mapped Tailwind theme.
- **FR-11** The v1 primitive set in §6.3 MUST be installed and themed: Button, Input, Textarea, Tooltip, Dialog/Drawer, Popover, DropdownMenu, Tabs, Switch, Checkbox, ScrollArea, Separator, Toast, Badge, Skeleton, Collapsible, Avatar.
- **FR-12** Each interactive primitive MUST expose default, hover, active, focus-visible, and disabled states styled from tokens; focus-visible MUST render the standard focus ring (§7.5).
- **FR-13** Iconography MUST use **Lucide** exclusively; icons MUST inherit `currentColor` and default to a 1.5px stroke, 20px size in UI contexts.

### App shell & layout
- **FR-14** An `AppShell` component MUST implement the §4.1 sidebar + canvas layout using the spacing/radii/border tokens, with the active sidebar item marked by an accent left-bar + tint.
- **FR-15** Below the `md` breakpoint the sidebar MUST collapse into an off-canvas drawer toggled from the topbar, and the canvas MUST go edge-to-edge with `px-4` gutters (FR test via Playwright at 375px and 1280px).
- **FR-16** The reading content column MUST be centered and capped at `max-w-3xl` (768px); this constraint MUST be a reusable layout primitive consumed by PRD-03.

### Identity
- **FR-17** A claudepad **wordmark + mark** MUST be delivered as inline SVG (mono-color, `currentColor`-driven) in at least: full lockup, mark-only (square, for favicons/avatars), and a small lockup; it MUST NOT reproduce Anthropic's asterisk, logo, or proprietary typefaces (§6.5).
- **FR-18** The mark MUST render legibly at 16px (favicon) through 64px and adopt the accent only as an optional single-color spark variant.

### Motion & accessibility
- **FR-19** Motion tokens (durations, easing — §7.4) MUST be defined; default UI transitions MUST be ≤ 150ms with the standard ease; no essential information may depend on animation.
- **FR-20** All animation MUST respect `prefers-reduced-motion: reduce` by disabling non-essential transitions/transforms.
- **FR-21** Every token color pairing used for text/icon-on-surface MUST pass the §7.1 contrast table in both themes; CI MUST include an automated contrast check over the documented pairings.
- **FR-22** Every interactive element MUST be keyboard-reachable and show a visible focus ring (§7.5) with ≥ 3:1 contrast against adjacent colors.

### Gallery deliverable
- **FR-23** A `/gallery` route/page MUST render: every color token (swatch + name + hex + computed contrast vs. its surface), the full type scale specimen, the Lucide icon set in use, the wordmark variants, and every adopted primitive in all interaction states — all with a light/dark toggle.
- **FR-24** The gallery MUST be buildable and viewable **offline** with no network requests (consistent with the single-bundle posture, §6.1).

## 6. Technical design

### 6.1 Q-1 resolution (single static bundle vs. SPA) — design-foundation angle

**Decision (this PRD's scope):** Build the client as a **single static bundle** — a Vite app that emits a small set of hashed JS/CSS assets plus one (or few) HTML entry points, **self-contained with no third-party runtime fetches** (fonts self-hosted per FR-7, icons tree-shaken from Lucide, no font/analytics CDNs). This honors D-11 and `_context.md` §3 ("buildable as a single static bundle … so self-hosting and auditing are trivial") and ROADMAP P1 ("Shippable as a single static page").

Design-foundation implications that constrain downstream PRDs:
- **Routing stays lightweight.** Prefer hash-based or a minimal file-router; the shell must function from a single `index.html` so a viewer link works when served as one static asset. Avoid SSR-only patterns. (Revisit only if PRD-08 playback or deep-linking genuinely requires a richer router — matches the D-11/Q-1 "revisit if routing/playback needs grow" leaning.)
- **No design-time dependency forces an SPA framework** (Next/Remix). React + Vite + the token/primitive layer here is framework-internal; the shell is mountable into either a single page or a few routes without re-theming.
- **Net:** the design system is **router-agnostic and SSR-agnostic**; tokens and primitives carry no assumption that defeats the single-bundle goal. Q-1 is therefore **resolved as "single static bundle"** for the foundation; any future SPA-ness is additive, not a re-architecture.

### 6.2 Token architecture

```
src/styles/
  tokens.css        # :root (light) + [data-theme="dark"] custom properties (single source)
  fonts.css         # @font-face for self-hosted serif/sans/mono
  globals.css       # base resets, body bg/text from tokens, focus-ring defaults
tailwind.config.ts  # maps semantic names -> var(--token); spacing/radii/shadow/motion scales
src/lib/theme.ts    # get/set/resolve theme; applies data-theme; persists; honors `system`
```

- **Two-layer tokens:** *primitive* tokens (raw scale values, internal) → *semantic* tokens (`--bg`, `--accent`, …) consumed by Tailwind. Components only ever touch semantic names. This keeps dark mode a pure semantic remap (FR-3/FR-5).
- **Accent tint** (`--accent-tint`, low-alpha clay) is a derived token for active rows/hover backgrounds so the accent stays a spark, not a flood (§4 form language).

### 6.3 shadcn/ui on Base UI + Tailwind

- Configure shadcn to target **Base UI** primitives (unstyled) and the token-mapped Tailwind theme; generated components live in `src/components/ui/` and are owned/editable in-repo.
- **Adopted v1 primitives (FR-11):** Button, Input, Textarea, Tooltip, Dialog, Drawer, Popover, DropdownMenu, Tabs, Switch, Checkbox, ScrollArea, Separator, Toast, Badge, Skeleton, Collapsible, Avatar.
- **Deferred (named here so downstream PRDs request, not invent):** Command/Combobox (search), Slider (PRD-08 timeline), Progress, Sheet, Resizable panels — themed when their owning PRD lands, but their tokens already exist.
- **Composition rule:** downstream PRDs compose these primitives; if a needed primitive is missing, the request routes back to this PRD to keep the foundation single-sourced.

### 6.4 Typography implementation

- **Serif (display):** `Newsreader` (OFL) as the canonical open choice for the "Afternoon, Toby" energy; `Source Serif 4` / `Lora` acceptable fallbacks. Self-hosted woff2, `font-display: swap`.
- **Sans (UI/body):** `Inter` (or `Geist Sans`) — clean grotesque, the default for all UI and transcript body.
- **Mono:** `JetBrains Mono` (or `Geist Mono`) for code blocks and secret placeholders (e.g. `[AWS_KEY ••••••••(20)]`, rendered by PRD-03/PRD-06).
- All self-hosted; **no Google Fonts / third-party CDN at runtime** (FR-7) to preserve the no-phone-home / auditable posture.

### 6.5 Identity / wordmark direction (FR-17/18)

- **Concept:** a "pad" of stacked conversation lines that resolves into a spark — e.g. a rounded-square **notepad/page glyph with a single clay spark/cursor mark** in the corner, or three descending hairline "transcript lines" with the top line tipped by an accent dot. The mark reads as *a place where sessions become clean pages*.
- **Wordmark:** `claudepad` set in the sans (or a lightly customized sans), lowercase, tight tracking; **not** a serif logotype and **not** using Anthropic's typefaces.
- **Hard constraints:** no asterisk/sunburst mark, no Anthropic logo, no Tiempos/Styrene. Single-color, `currentColor`-driven SVG so it inherits text or accent. Square mark variant for favicon/avatar at 16–64px.
- Final mark is a **design exploration deliverable** (≥ 2 candidate directions in the gallery); selection is an open question (Q-A below).

### 6.6 Trade-offs
- **Single bundle vs. routing richness:** chosen single-bundle simplicity now; deep-link/playback routing revisited later (Q-1).
- **shadcn ownership:** generated-in-repo components mean we own upkeep but gain full token control and auditability — aligned with the auditable-bundle goal.
- **Self-hosted fonts:** larger bundle vs. CDN, but required for no-phone-home; mitigated by subsetting woff2.
- **One brand, two modes:** simpler than a theming engine; sufficient for v1.

## 7. Data model / tokens (the design "schema")

### 7.1 Color tokens

Light is canonical (§4). Dark is a warm-dark swap. Contrast ratios are the AA target for the primary pairing.

| Semantic token | Light | Dark (warm) | Primary use | Contrast target |
|---|---|---|---|---|
| `--bg` | `#FAFAF7` | `#1A1917` | App canvas | text on it ≥ 4.5:1 |
| `--surface` | `#FFFFFF` | `#222120` | Cards, panels | text on it ≥ 4.5:1 |
| `--sidebar` | `#F3F2EE` | `#1F1E1C` | Sidebar / secondary surfaces | text on it ≥ 4.5:1 |
| `--border` | `#E8E6DF` | `#33312E` | 1px hairline borders | ≥ 1.5:1 vs adjacent |
| `--text` | `#1F1E1D` | `#ECEAE4` | Primary text | ≥ 4.5:1 on `--bg`/`--surface` |
| `--text-muted` | `#6B6862` | `#A6A29A` | Secondary text | ≥ 4.5:1 on `--bg` |
| `--accent` | `#CC785C` | `#D98E73` | Primary accent / spark | ≥ 3:1 (UI), text-on-accent ≥ 4.5:1 |
| `--accent-hover` | `#B5634A` | `#C57A60` | Hover state | — |
| `--accent-tint` | `rgba(204,120,92,.10)` | `rgba(217,142,115,.14)` | Active rows / soft hover bg | — |
| `--accent-fg` | `#FFFFFF` | `#1A1917` | Text/icon on accent fill | ≥ 4.5:1 on accent |
| `--success` | `#5E8C6A` | `#7FA98A` | Status: ok (low-sat warm green) | ≥ 3:1 |
| `--warn` | `#C28A3A` | `#D8A85A` | Status: caution (amber) | ≥ 3:1 |
| `--danger` | `#C25B4E` | `#DB776A` | Status: error / unredacted-secret warning | ≥ 3:1 |
| `--ring` | `#CC785C` | `#D98E73` | Focus ring (accent-derived) | ≥ 3:1 vs adjacent |

> Exact dark values are starting points; FR-21's automated check is the gate — values are tuned until every pairing passes, with the warm hue preserved.

### 7.2 Type scale

| Token / utility | Size / line-height | Role | Font role |
|---|---|---|---|
| `display-xl` | 40 / 48 | Hero greeting ("Afternoon, …") | serif |
| `display-lg` | 32 / 40 | Page / section hero | serif |
| `heading-1` | 24 / 32 | Major heading | serif |
| `heading-2` | 20 / 28 | Sub-heading | sans (semibold) |
| `heading-3` | 16 / 24 | Card / group title | sans (semibold) |
| `body` | 15 / 24 | Default UI + transcript body | sans |
| `body-sm` | 13 / 20 | Secondary / captions | sans |
| `label` | 12 / 16 (tracking +0.02em, uppercase opt.) | Sidebar section labels | sans (medium) |
| `code` | 13.5 / 22 | Code blocks, placeholders | mono |

### 7.3 Spacing, radii, borders, shadows

| Token | Value | Use |
|---|---|---|
| spacing scale | `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` (px) | All padding/margin/gap |
| `--radius-sm` | 6px | Inputs, badges, small controls |
| `--radius-md` | 8px | Buttons, list items |
| `--radius-lg` | 12px | Cards, panels, dialogs |
| `--radius-full` | 9999px | Avatars, pills, toggles |
| `--border-hairline` | `1px solid var(--border)` | Default separation (favored over shadow) |
| `--shadow-sm` | `0 1px 2px rgba(31,30,29,.05)` | Subtle raise (rarely) |
| `--shadow-md` | `0 4px 16px rgba(31,30,29,.08)` | Popovers, dialogs, drawer |

> Form language (§4): hairline borders over heavy shadows; soft 8–12px radii; generous whitespace.

### 7.4 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | Hover/active, micro-feedback |
| `--motion-base` | 150ms | Default UI transitions (≤150ms per FR-19) |
| `--motion-slow` | 220ms | Drawer/dialog enter/exit only |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default easing (restrained, fast-out) |
| `--ease-emphasized` | `cubic-bezier(0.3, 0, 0, 1)` | Overlay enter |
| reduced-motion | all → `0ms`, no transform | Honors `prefers-reduced-motion` (FR-20) |

### 7.5 Focus ring

`--ring` (accent-derived), rendered as `outline: 2px solid var(--ring); outline-offset: 2px;` on `:focus-visible` for all interactive elements (FR-22). Must keep ≥ 3:1 against both the element and its background in both themes.

### 7.6 Theme module contract

```ts
type Theme = "light" | "dark" | "system";
getTheme(): Theme;                 // from localStorage["claudepad.theme"], default "system"
setTheme(t: Theme): void;          // persist + apply
applyResolvedTheme(): void;        // resolves system→light/dark, sets <html data-theme>
// system resolution via matchMedia("(prefers-color-scheme: dark)"); fallback → light
```

No backend/API surface — this PRD is purely client-side.

## 8. Security & privacy

This PRD conforms to `_context.md` §5 / `SECURITY-MODEL.md` posture:
- **No-phone-home foundation:** self-hosted fonts and tree-shaken icons (FR-7, FR-13) mean the UI layer issues **no third-party runtime requests**, keeping the single auditable static bundle clean — directly supporting the zero-knowledge / auditability story (§5.1, D-11).
- **No data handled here:** the design system processes no session content, keys, or secrets; it introduces no new data flows or storage beyond a single non-sensitive `localStorage` theme preference.
- **Secret-affordance hooks:** this PRD defines the **visual primitives** (mono placeholder style, `--danger`/`--warn` status colors, Badge) that PRD-06 uses to render opaque `[TYPE ••••••••(n)]` placeholders and the mandatory review-before-share warnings — but it neither detects nor renders real secrets.
- **Risks introduced:** minimal. Theme preference in `localStorage` is non-sensitive. The only caution is ensuring no token/font/icon pipeline silently adds a CDN dependency; FR-6/FR-7 and CI guard this.

## 9. Dependencies

**Upstream (this PRD depends on):**
- `_context.md` §3 (tech stack) and §4 (design tokens) — canonical inputs.
- Project repo scaffold (Vite + React + TS + Tailwind), shared per P0 with PRD-02.

**Downstream (these depend on this PRD):**
- **PRD-03 (Viewer)** — consumes tokens, type scale, the `max-w-3xl` reading column, Collapsible/Badge/Tabs, and the mono placeholder style.
- **PRD-04 (Ingest & Onboarding)** — consumes AppShell, empty-state patterns, Button/Dialog/Drawer, drag-drop surface styling.
- **PRD-06 (Secret Detection & Tiered Reveal)** — consumes Badge, `--danger`/`--warn`, mono placeholder style, Dialog/Checkbox/Input for the review UI.
- **PRD-08 (Playback)** — consumes motion tokens and the (deferred-but-tokenized) Slider/Progress primitives, plus presentation-mode surface styling.
- **PRD-05/07/09** — consume the shell and primitives for share dialogs, status/toasts, and self-host/branding surfaces.

## 10. Acceptance criteria / DoD

- [ ] `tokens.css` defines all §7.1 color tokens for `:root` (light) and `[data-theme="dark"]`; Tailwind maps semantic names (FR-1, FR-2).
- [ ] Flipping `data-theme` re-themes the entire app with no component code change and no DOM-structure diff (FR-3) — verified on the gallery.
- [ ] Default theme is light; `system` supported and persisted; unknown value → light (FR-4).
- [ ] Dark theme is warm (`--bg` ≈ `#1A1917`), accent recognizable, all pairings pass contrast (FR-5, FR-21).
- [ ] CI fails on raw hex outside `tokens.css` (FR-6) and on any failing documented contrast pairing (FR-21).
- [ ] Serif/sans/mono roles tokenized, self-hosted, no third-party font fetch (FR-7); type scale §7.2 implemented; serif restricted to display (FR-8).
- [ ] shadcn configured on Base UI; all FR-11 primitives installed, themed, and showing all interaction states + focus ring (FR-10, FR-12, FR-22).
- [ ] Lucide-only iconography, `currentColor`, 1.5px/20px default (FR-13).
- [ ] `AppShell` implements §4.1 layout incl. active-item accent bar; collapses to drawer < `md` with edge-to-edge canvas (FR-14, FR-15); reading column capped at `max-w-3xl` as a reusable primitive (FR-16).
- [ ] Distinct claudepad wordmark/mark delivered (full lockup, mark-only, small lockup) as `currentColor` SVG; legible 16–64px; no Anthropic asterisk/logo/fonts (FR-17, FR-18); ≥ 2 candidate directions shown in gallery.
- [ ] Motion tokens defined; default transitions ≤ 150ms; `prefers-reduced-motion` honored (FR-19, FR-20).
- [ ] `/gallery` renders all tokens (with contrast readouts), type specimen, icons, wordmarks, and every primitive in both themes, fully offline (FR-23, FR-24).
- [ ] Q-1 resolved in §6.1 with downstream constraints documented.
- [ ] Manual visual review confirms the "warm, calm, minimal, fast" feeling matching the reference's *feeling* while being recognizably distinct.

## 11. Open questions

- **Q-A (new, owned here):** Which wordmark/mark direction wins (notepad-glyph-with-spark vs. transcript-lines-with-accent-dot)? Needs a design pick before launch (PRD-09); gallery hosts the candidates. *Leaning: the page/notepad glyph with a single clay spark — most literally "claude" + "pad," scales to a favicon.*
- **Q-B (new, owned here):** Exact open-font choices — `Newsreader` vs `Source Serif 4` for serif; `Inter` vs `Geist` for sans; `JetBrains Mono` vs `Geist Mono`. *Leaning: Newsreader + Inter + JetBrains Mono for licensing safety and the warm-serif energy.* Final pick pending bundle-size/subsetting check.
- **Q-1 (from `_context.md` / DECISIONS):** Single static bundle vs. SPA — **resolved for the design foundation as single static bundle** (§6.1); routing richness revisitable if PRD-08 playback/deep-linking demands it. Flagged here only to record the resolution; final routing mechanics are confirmed in PRD-03.
- **Q-C (new):** Do we adopt a dedicated brand display weight/optical-size for the serif greeting, or rely on the chosen serif's defaults? *Leaning: defaults for v1; revisit if the hero feels generic.*

## 12. Phase / milestone

**Phase P0 — Foundation** (ROADMAP §3). Alongside PRD-02 (Parser & Normalized Schema). Nothing user-visible ships in P0, but this PRD is a hard prerequisite for the P1 MVP-0 (PRD-03/04) and every later UI surface. On the critical path: **PRD-01 → PRD-02 → PRD-03 → PRD-04 → …**
