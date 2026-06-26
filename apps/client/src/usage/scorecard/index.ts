// @/usage/scorecard - the shareable scorecard: a pure stats fold + canvas
// renderer + the Download/Copy dialog. Launched from the Usage Insights header.

export { ScorecardDialog } from './ScorecardDialog'
export { buildScorecard, type Scorecard, LEAN_SESSION_TOKENS } from './stats'
export { drawScorecard, CARD_W, CARD_H, type CardPalette, type CardIdentity } from './draw'
