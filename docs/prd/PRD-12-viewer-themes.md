# PRD-12 - Viewer Themes (Aesthetic Palette Axis)

> **Phase:** Post-launch polish · **Status:** Built (2026-06-22) · **New**
> **Canonical refs:** `PRD-01-design-system.md` (§7.1 tokens, FR-1/FR-3/FR-6/FR-21), `../DECISIONS.md` D-71…D-73, D-49 (one-attribute-flip). Builds directly on the functional light/dark theme (`lib/theme.ts`).

---

## 1. Summary & problem

claudepad has one look (warm-minimal) with a functional **light/dark/system** toggle. A reader presenting or just reading a prettified session may want a different *aesthetic* - cooler neutrals, an ocean palette, or a high-contrast a11y palette - without that being the same control as light/dark. **Viewer themes** add an aesthetic **palette axis** orthogonal to light/dark: a palette is a token-override block selected by a single `<html data-viewer-theme>` attribute, composing with `data-theme` as palette × mode. No component recomputation; everything flows through the existing `@theme inline` → `var(--*)` mapping.

## 2. Goals / Non-goals

### Goals
- **G1.** A palette axis (`data-viewer-theme`) independent of light/dark, preserving the one-attribute-flip / no-recompute model (D-49, D-71).
- **G2.** Ship 4 palettes - `warm` (default), `slate`, `ocean`, `contrast` - each with full **light + dark** token blocks (D-72).
- **G3.** A single **Appearance** popover holding both mode (light/dark/system) and palette, replacing the standalone theme toggle (frictionless-first: one surface).
- **G4.** **Global + persisted** choice (`localStorage["claudepad.viewer-theme"]`), applied pre-paint (no flash), mirroring `lib/theme.ts`.
- **G5.** Every palette × mode clears `scripts/check-contrast.mjs` (WCAG, FR-21); all color stays in `tokens.css` (FR-6, `check-no-raw-hex`).

### Non-goals
- **Per-session** palette (global only for v1).
- **Code-following Shiki themes** - code keeps the bundled `github-light`/`github-dark` pair; palettes restyle chrome only (D-73). Deferred.
- A dedicated playback "presentation" palette (PRD-08 tie-in). Deferred.

## 3. Design

- **Token layer** (`packages/client/src/styles/tokens.css`): after the base warm light/dark blocks, paired override blocks per palette: `[data-viewer-theme='<id>'][data-theme='light']` and `…[data-theme='dark']`. Each redeclares the full semantic color set; shadows/radii/motion inherit from the base mode block. Specificity (0,2,0) beats the base `[data-theme=…]` (0,1,0).
- **State** (`packages/client/src/lib/viewer-theme.ts`): `getViewerTheme`/`setViewerTheme`/`applyViewerTheme` + `VIEWER_THEMES`, default `warm`, storage-unavailable guards - a direct mirror of `lib/theme.ts` (no system/matchMedia branch; a palette has no OS signal).
- **No-flash boot**: the inline `index.html` head script sets `data-viewer-theme` alongside `data-theme` before first paint; `main.tsx` calls `applyViewerTheme()` post-hydration.
- **Control** (`packages/client/src/components/shell/AppearanceMenu.tsx`): a top-bar `Palette` icon → popover with a **Mode** segmented group and a **Palette** grid (live swatches scoped via both data-attributes so each option shows its own colors without raw hex). Wired into `AppShell` `trailing`.
- **Gates**: `scripts/check-contrast.mjs` validates every palette × mode by layering base + override; `/gallery` adds a palette switch + per-palette contrast table.

## 4. Verification

- `node scripts/check-contrast.mjs` passes for 4 palettes × light/dark; `node scripts/check-no-raw-hex.mjs` clean.
- `pnpm check` green (includes the above + `viewer-theme` unit test).
- Manual: Appearance popover switches palette/mode independently; reload persists both with no flash; code blocks stay on github light/dark.

## 5. Open questions / future

- Per-session palette override (revisit if presenters ask for it).
- Code-following Shiki themes per palette (bundle-cost trade-off, D-73).
- A playback presentation palette (PRD-08).
