// @/usage/scorecard - draw.ts
//
// Pure canvas rendering of a scorecard onto a fixed 1200x630 social-share frame
// (the Twitter/OG landscape ratio). Deterministic: same Scorecard + palette in,
// same pixels out - no DOM, no React. Colors and font stacks are passed in
// (resolved from the live design tokens by the caller) so no raw hex lives here.

import { formatCost, formatCount, formatTokens } from '../format'
import type { Scorecard } from './stats'

export const CARD_W = 1200
export const CARD_H = 630

export interface CardPalette {
  bg: string
  surface: string
  text: string
  muted: string
  accent: string
  accentTint: string
  border: string
  serif: string
  sans: string
  mono: string
}

export interface CardIdentity {
  name: string
  /** Emoji fingerprint (6 glyphs) - the human-verifiable identity check. */
  emoji: string
}

export interface DrawOptions {
  identity?: CardIdentity
  /** Right-aligned context line under the wordmark, e.g. "all time" or a range. */
  rangeLabel?: string
}

// A minimal 2D context surface - the bits we use. Lets the renderer be tested
// against a recording mock without a real canvas.
export interface DrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  closePath(): void
  fill(): void
  stroke(): void
}

const PAD = 56
const INSET = 32

function roundRect(ctx: DrawContext, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

interface TextStyle {
  size: number
  family: string
  weight?: number
  color: string
  align?: CanvasTextAlign
}

function text(ctx: DrawContext, value: string, x: number, y: number, s: TextStyle): void {
  ctx.font = `${s.weight ?? 400} ${s.size}px ${s.family}`
  ctx.fillStyle = s.color
  ctx.textAlign = s.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

interface Tile {
  value: string
  label: string
}

function metricTiles(card: Scorecard): Tile[] {
  return [
    { value: pct(card.cacheRatio), label: `cache efficiency · grade ${card.grade}` },
    { value: formatTokens(card.avgContextPerTurn), label: 'avg context / turn' },
    { value: formatCount(card.sessions), label: `sessions · ${formatCount(card.projects)} projects` },
    { value: pct(card.leanShare), label: 'sessions kept lean' }
  ]
}

export function drawScorecard(ctx: DrawContext, card: Scorecard, p: CardPalette, opts: DrawOptions = {}): void {
  // Canvas backdrop + inset card panel.
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const cx = INSET
  const cy = INSET
  const cw = CARD_W - INSET * 2
  const ch = CARD_H - INSET * 2
  ctx.fillStyle = p.surface
  roundRect(ctx, cx, cy, cw, ch, 24)
  ctx.fill()
  ctx.strokeStyle = p.border
  ctx.lineWidth = 1
  ctx.stroke()

  const left = cx + PAD
  const right = cx + cw - PAD
  let y = cy + PAD + 24

  // Header: wordmark + range, with a grade badge on the right.
  text(ctx, 'claudepad', left, y, { size: 34, family: p.serif, weight: 600, color: p.accent })
  text(ctx, 'scorecard', left + 196, y, { size: 24, family: p.sans, weight: 500, color: p.muted })
  text(ctx, opts.rangeLabel ?? 'all time', right, y - 4, {
    size: 16,
    family: p.sans,
    color: p.muted,
    align: 'right'
  })

  // Grade badge (top-right circle).
  const badgeR = 38
  const badgeX = right - badgeR
  const badgeY = y + 78
  ctx.fillStyle = p.accentTint
  ctx.beginPath()
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  text(ctx, card.grade, badgeX, badgeY + 18, { size: 52, family: p.serif, weight: 600, color: p.accent, align: 'center' })
  text(ctx, 'cache grade', badgeX, badgeY + badgeR + 26, { size: 14, family: p.sans, color: p.muted, align: 'center' })

  // Hero: total tokens + cost/activity subtitle.
  y += 70
  text(ctx, 'TOTAL TOKENS', left, y, { size: 16, family: p.sans, weight: 600, color: p.muted })
  y += 78
  text(ctx, formatTokens(card.totalTokens), left, y, { size: 96, family: p.serif, weight: 600, color: p.text })

  y += 40
  const costStr = card.cost === null ? 'cost n/a' : `≈ ${formatCost(card.cost)} API-equivalent`
  const heroSub = `${costStr}  ·  ${formatCount(card.activeDays)} active days${
    card.topModel ? `  ·  ${shortModel(card.topModel)}` : ''
  }`
  text(ctx, heroSub, left, y, { size: 20, family: p.sans, color: p.muted })

  // Metric tiles row.
  const tiles = metricTiles(card)
  const gap = 16
  const tileW = (right - left - gap * (tiles.length - 1)) / tiles.length
  const tileH = 116
  const tileY = cy + ch - PAD - 44 - tileH
  tiles.forEach((tile, i) => {
    const tx = left + i * (tileW + gap)
    ctx.fillStyle = p.accentTint
    roundRect(ctx, tx, tileY, tileW, tileH, 14)
    ctx.fill()
    text(ctx, tile.value, tx + 20, tileY + 56, { size: 40, family: p.serif, weight: 600, color: p.text })
    text(ctx, tile.label, tx + 20, tileY + 90, { size: 15, family: p.sans, color: p.muted })
  })

  // Footer: url left, optional identity right.
  const footY = cy + ch - PAD + 8
  text(ctx, 'claudepad.io', left, footY, { size: 16, family: p.sans, weight: 500, color: p.muted })
  if (opts.identity) {
    text(ctx, `${opts.identity.emoji}  ${opts.identity.name}`, right, footY, {
      size: 18,
      family: p.sans,
      color: p.text,
      align: 'right'
    })
  } else {
    text(ctx, 'local · private · self-hosted', right, footY, {
      size: 16,
      family: p.sans,
      color: p.muted,
      align: 'right'
    })
  }
}
