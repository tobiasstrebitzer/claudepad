# PRD-13 - Usage Insights ("Usage Stats")

> **Phase:** Post-launch feature (the first new feature after the v1.0 launch). · **Status:** Draft. · **Owner:** next session.
>
> A local, private analytics surface over the sessions claudepad already reads. Connect `~/.claude` once (the vault we already have) and see **where your tokens, cost, and time went** - global vs per-project - without anything leaving the browser.
>
> Read [`_context.md`](./_context.md) first (canonical tech stack, design language, the no-server principle, the normalized schema). This PRD conforms to it. The crypto/sharing model is untouched here; Usage Insights is a **read-only analysis view**, not a sharing flow.
>
> **Naming note (per CLAUDE.md "name for intent"):** the requested working title was "Usage Stats"; the product surface is named **Usage Insights** - the outcome (insight into your usage) over the mechanism (statistics). Route: `#/usage`. Module: `apps/client/src/usage/`.

---

## 1. Summary & problem

claudepad already connects to `~/.claude/projects/` and parses every session. Each assistant turn in that data carries exactly what an analytics view needs - `model`, a full `usage` block (input / output / cache-create / cache-read tokens, with the `ephemeral_1h`/`ephemeral_5m` cache split and `service_tier`), a `timestamp`, and the project `cwd` - but today claudepad surfaces **none** of it. A user on a Pro/Max subscription has no idea which projects consumed the most tokens, where their effective cost went, or what their usage is "worth."

Usage Insights turns the already-connected vault into a **reporting dashboard**: aggregate token usage and estimated cost (global, per-project, per-session, per-model, over time), with time-pattern visualizations (calendar activity, weekday x hour heatmap, distribution histograms). It estimates an **API-equivalent cost**, attributes a user-entered **subscription spend** across projects ("Real Spend"), and offers a deliberately-rough **effort-equivalent** ("man-hours") figure. Everything is computed client-side and never leaves the page - consistent with v1's "no server, nothing to trust."

## 2. Goals / Non-goals

**Goals**
- **Derive, don't ask.** Reuse the existing folder-connect vault; no new upload, no manual data entry beyond the subscription amount and optional tuning knobs.
- Aggregate token usage across the vault: **global, per-project (by `cwd`), per-session, per-model, and over time.**
- **Estimate API-equivalent cost** from a bundled, honestly-dated, user-editable pricing table that models the cache tiers correctly (cache reads are ~an order of magnitude cheaper than fresh input - ignoring this makes estimates meaningless).
- **"Real Spend" attribution:** distribute a user-entered subscription amount across projects proportional to their usage share, over a selectable date range. Framed explicitly as an *allocation*, not a bill.
- **Effort equivalent:** a configurable, clearly-labeled-as-rough "man-hour" estimate (global and per-project).
- **Visualizations:** metric cards, sortable project table, time-series, weekday x hour heatmap, token/session histograms, model breakdown - all hand-rolled with design tokens (no new chart dependency, no raw hex).
- **Fully offline & private:** all computation local; bundle still makes no third-party fetch (`check-no-external-origins` stays green).
- **Fast on a real vault:** parse off the main thread, cache per-file aggregates, recompute incrementally.

**Non-goals (this feature's v1)**
- No server, no cloud aggregation, no cross-device sync, no live tailing (a snapshot computed on demand + a Refresh action; not a streaming monitor).
- **Not a billing/accounting tool.** Cost is an estimate of *API-equivalent value*; a subscription user does not pay per-token. This is stated wherever a dollar figure appears (honesty-over-polish, `_context.md` §5.4).
- Not sharing usage reports (a shareable, recipient-encrypted usage report reusing the existing blob model is a natural **vNext**, OQ-9).
- Not multi-source - Claude Code JSONL only, like the parser.
- No per-account/login; this analyzes whatever sessions are on this machine.

## 3. Personas & user stories

- **Cost-curious dev:** "As a developer, I want to see which projects consumed the most tokens and estimated cost, so I know where my AI budget actually goes."
- **Optimizer:** "As a power user, I want to spot inefficient projects (low output per input token, heavy cache misses, runaway tool loops), so I can change how I work."
- **Justifier / freelancer:** "As someone billing clients, I want to attribute a dollar share of my Max subscription to each client's project over a date range, so I can expense or invoice it defensibly."
- **Reflector:** "As a curious user, I want to see when I use Claude (weekday/hour heatmap) and a rough 'how much work did it do' figure, so I can understand my own habits."

## 4. UX & flows

Reached from the sidebar footer ("Usage") and the route `#/usage`. If the vault is connected, it computes immediately (from cache when possible); if not, it shows a connect prompt (and a drop/paste fallback for non-Chromium - see FR-15).

```
┌─ Usage Insights ──────────────────────────  [ Global | Project ▾ ]  [ Date range ▾ ]  ⟳ ─┐
│                                                                                            │
│  ┌── Total tokens ──┐ ┌── Est. cost ───┐ ┌── Sessions ──┐ ┌── Active days ─┐ ┌─ Top model ┐│
│  │ 48.2M            │ │ ~$73.10        │ │ 312          │ │ 56             │ │ opus-4-8   ││
│  │ in/out/cache …   │ │ API-equivalent │ │ 19 projects  │ │ since Apr 3    │ │ 71% tokens ││
│  └──────────────────┘ └────────────────┘ └──────────────┘ └────────────────┘ └────────────┘│
│                                                                                            │
│  Tokens over time            ┌───────────────────────────────────────────────┐           │
│  (stacked by kind)           │ ▁▂▃▅▇▆▃▂▁ … per day/week                        │           │
│                              └───────────────────────────────────────────────┘           │
│                                                                                            │
│  When you work (weekday x hour)         Tokens per session (histogram)                    │
│  Mon ░░▓▓██▓░  …                         ▁▃▇▅▂▁                                            │
│                                                                                            │
│  ┌─ Projects ───────────────── tokens ─── est.cost ─ "real spend" ─ sessions ─ last ────┐ │
│  │ silkweave                    18.1M      $27.4       $41.20         96        2d ago    │ │
│  │ claudepad                    11.7M      $17.9       $26.90         74        1h ago    │ │
│  │ …                          (sortable; click a row to drill into its sessions)         │ │
│  └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                            │
│  Real Spend  [ subscription $ ___ / month ▾ ]  attributed by [ est. cost ▾ ]  ⓘ allocation │
│  Effort equiv ~ 38 h  ⓘ rough estimate · how this is computed ▾ (editable)                 │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Drill-in: clicking a project row scopes every card/chart to that project and lists its sessions (each linking into the existing viewer). A first-compute over a large vault shows a progress bar ("Reading 312 sessions…"); subsequent visits are near-instant from cache.

## 5. Functional requirements

**Data model & extraction**
- **FR-1** Extend the normalized schema (tolerant, per PRD-02 ethos): lift `message.usage` and `message.model` into a typed `usage?: TokenUsage` on `AssistantEvent`. Capture `input`, `output`, `cacheCreate` (`cache_creation_input_tokens`), `cacheRead` (`cache_read_input_tokens`), the `ephemeral_1h`/`ephemeral_5m` split, and `serviceTier`. Unknown sub-fields are ignored, not dropped (raw is still preserved); sessions without usage parse fine with `usage` absent. Add fixtures from the real corpus (`apps/client/test/schema/fixtures/real-*.jsonl` already contain usage).
- **FR-2** A **pure** aggregation module `usage/aggregate.ts`: fold a `Session` (or an event iterator) into a `SessionUsage` - totals per token-kind, per model, message count, first/last timestamp, active duration (idle-collapsed). No I/O, fully unit-tested.
- **FR-3** A vault roll-up `VaultUsage`: per-project (`cwd`-keyed) and global aggregates, plus per-day and per-(weekday,hour) buckets, built by streaming each session once.

**Cost**
- **FR-4** A bundled pricing table `usage/pricing.ts`: `model id -> per-MTok rates` for input, output, cache-write (5m and 1h tiers), and cache-read, each with an **"as of" date** and a visible source note. No network fetch (bundled, so the no-external-origins gate stays green).
- **FR-5** Estimated cost per session/project/global = usage x pricing, **broken down by token kind** so cache economics are reflected. Unknown models surface as "unpriced" (counted in tokens, excluded from cost, flagged), never silently mis-priced.
- **FR-6** Pricing is **user-editable**; overrides persist locally (IndexedDB via `idbKv`). Every cost figure is labeled "estimated, API-equivalent" with the pricing "as of" date reachable in one hover/click.

**Real Spend & effort**
- **FR-7** "Real Spend": the user enters a subscription amount + period; the dashboard attributes it across projects proportional to a selectable weight (default: estimated-cost share; alt: raw-token share) within the active date range. Labeled an **allocation**, with the method shown.
- **FR-8** "Effort equivalent": a configurable estimate (default formula documented and editable, e.g. derived from output volume and/or idle-collapsed wall-clock x a factor), shown global and per-project with a prominent **"rough estimate"** disclaimer and the formula visible.

**Visualizations** (all hand-rolled SVG/CSS, design-token colors only)
- **FR-9** Summary metric cards: total tokens (with in/out/cache split), estimated cost, session count, active days, top model.
- **FR-10** Sortable project table (tokens, est. cost, real-spend, sessions, last-active) with drill-in to per-session.
- **FR-11** Time-series of tokens (and a cost toggle) per day/week over the vault's range, stacked by token-kind.
- **FR-12** Weekday x hour activity heatmap (by message count or tokens).
- **FR-13** Histogram of tokens-per-session (distribution / outlier spotting).
- **FR-14** Model breakdown (share by tokens and by cost).

**Integration, performance, privacy**
- **FR-15** New hash route `#/usage` following the `#/about` / `#/gallery` overlay pattern (`App.tsx`), linked from the sidebar footer, with a "Back to app" top bar. Uses the connected vault; if unconnected, shows a connect prompt plus a drop/paste fallback (parses the dropped subset) for non-Chromium browsers.
- **FR-16** The full-vault parse runs **off the main thread** (Web Worker), iterating files with visible progress; the UI never blocks. Per-file aggregates are **cached in IndexedDB** keyed by `(fileId, size, lastModified)` so re-opening recomputes only changed/new files (incremental). Reuses `apps/client/src/lib/idbKv.ts`.
- **FR-17** Date-range and project filters; a global<->project toggle re-scopes every card and chart.
- **FR-18** All computation is local; nothing is uploaded; the pricing table is bundled, not fetched. Usage data and figures never leave the browser. No change to the CSP / external-origins posture.

## 6. Technical design

New module `apps/client/src/usage/`:

- `types.ts` - `TokenUsage`, `SessionUsage`, `ProjectUsage`, `VaultUsage`, `Pricing`, `CostBreakdown`.
- `aggregate.ts` - pure folds (FR-2/3), reused by the worker and by tests.
- `pricing.ts` - the bundled rate table + `costOf(usage, pricing)` (FR-4/5).
- `attribution.ts` - subscription split (FR-7); `effort.ts` - the effort heuristic (FR-8).
- `worker.ts` - parses + aggregates session files off-thread (FR-16); posts progress + results.
- `cache.ts` - `idbKv`-backed per-file aggregate cache keyed by `(fileId,size,lastModified)`.
- UI: `pages/UsageInsights.tsx` + `usage/components/{MetricCards,ProjectTable,TimeSeries,Heatmap,Histogram,ModelBreakdown}.tsx` and a tiny chart-primitive layer `usage/charts/{Bars,Line,HeatGrid}.tsx`.

**Reuse:** the parser (`apps/client/src/schema`), the vault (`apps/client/src/fs`, including FSA handle access), `idbKv`, and the playback scrubber's **kind-color** approach (`playback/Scrubber.tsx` maps event kinds to token-backed classes) as the template for chart palettes.

**Charts - build, don't add a library (decision, OQ-6 open for challenge):** hand-rolled SVG/CSS keeps the single-bundle + no-CDN posture, respects the `check-no-raw-hex` gate (a charting lib typically injects raw colors), and matches the existing hand-built scrubber. Cost: more code. Accepted per `_context.md` §3 (single auditable bundle) and the "pay to delete a step / keep it auditable" principle. A small categorical **data-viz token set** (e.g. `--data-1..6`, plus the existing kind/status/accent tokens) is added to `tokens.css` and validated by `check-contrast`.

**Performance:** the worker streams files via the vault's FSA handles (postMessage-able in Chromium), aggregates each, and the per-file `SessionUsage` is cached so a re-open only reparses changed files. Big vaults stay responsive (progress UI; no main-thread parse). Targets in §10.

**Cost subtlety (call-out):** the raw data distinguishes fresh input, cache-write (5m vs 1h ephemeral), and cache-read - which differ in price by ~5-20x. Modeling them separately is what makes the estimate meaningful; collapsing to "tokens" would be misleading. Server tool use (`server_tool_use.web_search_requests` / `web_fetch_requests`) is billed per-request and is a cost refinement (OQ-7).

## 7. Data model

```ts
// Lifted into the normalized schema (FR-1), tolerant of absence/extra fields.
interface TokenUsage {
  input: number          // input_tokens
  output: number         // output_tokens
  cacheCreate: number    // cache_creation_input_tokens
  cacheRead: number      // cache_read_input_tokens
  cacheCreate1h?: number // cache_creation.ephemeral_1h_input_tokens
  cacheCreate5m?: number // cache_creation.ephemeral_5m_input_tokens
  serviceTier?: string   // "standard" | "priority" | ...
}
// AssistantEvent gains: usage?: TokenUsage   (model?: string already exists)

interface SessionUsage {
  sessionId: string
  cwd?: string
  model?: string                  // dominant
  totals: TokenUsage              // summed over assistant turns
  byModel: Record<string, TokenUsage>
  messages: number
  firstAt?: string; lastAt?: string
  activeMs: number                // idle-collapsed wall-clock
}
interface ProjectUsage { project: string; totals: TokenUsage; byModel: Record<string, TokenUsage>; sessions: number; firstAt?: string; lastAt?: string; activeMs: number }
interface VaultUsage {
  global: ProjectUsage
  projects: ProjectUsage[]
  byDay: Record<string /*YYYY-MM-DD*/, TokenUsage>
  byWeekdayHour: number[][]       // [7][24] activity buckets
  computedAt: string
}

interface Pricing {                // per million tokens, USD
  model: string; asOf: string; source?: string
  input: number; output: number
  cacheWrite5m: number; cacheWrite1h: number; cacheRead: number
}
```

## 8. Security & privacy

Conforms to `_context.md` §5 and `security-model.md`. Usage Insights reads the same local files the viewer already reads; it adds **no** network surface (pricing is bundled, not fetched) and shares nothing - so the trustless posture is unchanged. The only persisted artifacts are local IndexedDB caches (per-file aggregates, pricing overrides, the subscription/effort settings), same trust domain as the existing vault handle and identity stores. Aggregates can themselves be sensitive (project names = your `cwd`s); they stay on-device. The honesty principle (`_context.md` §5.4) is load-bearing here: every monetary and effort figure is explicitly an **estimate**, with its method and "as of" date visible. (vNext: a recipient-encrypted shareable report would route through the existing `createBlob` and inherit the trustless guarantees - OQ-9.)

## 9. Dependencies

- **Schema/parser** (`apps/client/src/schema`) - small tolerant extension (FR-1). Touches PRD-02 territory; keep it additive and fixture-tested.
- **Vault** (`apps/client/src/fs`) - reuse folder-connect, project grouping by `cwd`, FSA handle access; possibly expose a "read all session files" iterator.
- **`idbKv`** (`apps/client/src/lib/idbKv.ts`) - per-file aggregate cache + settings.
- **Design tokens** (`styles/tokens.css`) - add a data-viz palette; must pass `check-contrast`.
- **Routing/shell** (`App.tsx`, sidebar footer) - new overlay route + entry point.
- Downstream/related: a future "share usage report" reuses `packages/crypto` (no dependency now).

## 10. Acceptance criteria / DoD

- [ ] `TokenUsage` lifted into `AssistantEvent`; parser tolerant of presence/absence; fixtures cover real usage blocks (incl. the ephemeral cache split). `pnpm check` green.
- [ ] Pure `aggregate.ts` with unit tests: a known fixture vault produces expected per-kind, per-model, per-project, per-day, and weekday/hour totals.
- [ ] Cost estimate models cache tiers distinctly; unknown models flagged "unpriced," never mis-priced; every figure labeled "estimated / API-equivalent" with an "as of" date.
- [ ] Real-Spend attribution sums to the entered subscription amount across projects for the selected range; method is visible; labeled an allocation.
- [ ] Effort estimate shows formula + a "rough estimate" disclaimer and is editable.
- [ ] All six visualizations render from real vault data using only design tokens (no raw hex; `check-contrast` passes for the new data-viz tokens).
- [ ] `#/usage` route + sidebar entry; works from a connected vault and via the drop/paste fallback; "Back to app" returns home.
- [ ] Worker-based compute with progress; per-file IndexedDB cache makes re-open incremental; a large vault (target: 500 sessions / ~1 GB) stays responsive (no main-thread jank; first compute streamed with progress).
- [ ] No new third-party fetch; `verify:no-phone-home` (check-no-external-origins) green.
- [ ] Playwright smoke: open `#/usage` on a fixture vault, assert cards + table + a chart render.

## 11. Open questions

- **OQ-1 (pricing freshness):** bundled table + "as of" date + editable overrides is the proposal (no fetch). Is manual maintenance acceptable, or do we want an opt-in, allow-listed pricing fetch later? Recommend: bundled-only for v1, with a stale-date warning.
- **OQ-2 (effort formula):** output-token-based, idle-collapsed-wall-clock-based, or a blend? What default factor is defensible? It is inherently fuzzy - confirm we present it as a directional toy, editable, not a headline metric.
- **OQ-3 (Real-Spend weight & periods):** default to est-cost share vs token share? How to handle a monthly subscription over a multi-month vault (per-month allocation vs whole-range proration)?
- **OQ-4 (schema vs raw):** lift `usage` into the typed schema (recommended - reusable, testable) vs computing from `event.raw` only inside `usage/`? Recommend lifting.
- **OQ-5 (cache & correctness):** is `(fileId,size,lastModified)` a safe cache key for session files (Claude Code appends; size/mtime change on append)? Confirm append-only behavior so the key is sound.
- **OQ-6 (charts):** hand-rolled vs a tiny tree-shakeable lib that can be fed CSS-var colors. Recommend hand-rolled to preserve the no-raw-hex + single-bundle posture; revisit if the chart surface grows.
- **OQ-7 (server tool use):** include per-request web-search/web-fetch costs (data is present) or defer? Likely a small refinement.
- **OQ-8 (non-Chromium):** how much of the feature works via drop/paste without folder-connect (Safari/Firefox)? Define the degraded experience.
- **OQ-9 (vNext - shareable report):** a recipient-encrypted usage report via the existing blob model - in scope later? Out of scope now, but the design should not preclude it.
- **OQ-10 (boundaries):** define "active duration" (idle threshold reuse from the playback timeline's idle-collapse) and the calendar timezone (local vs UTC) for day/heatmap bucketing.

## 12. Phase / milestone

Post-launch feature - the first new capability after v1.0. Suggested build order: **FR-1 (schema + fixtures) -> FR-2/3 (pure aggregation + tests) -> FR-4/5/6 (cost) -> FR-9/10/11 (cards, table, time-series) -> FR-16 (worker + cache) -> FR-12/13/14 (heatmap, histogram, models) -> FR-7/8 (Real Spend, effort) -> FR-15/17 (route, filters, fallback)**. The pure aggregation core (FR-1/2/3) is the spine and is the most testable; the dashboard and the fuzzy estimates layer on top.
