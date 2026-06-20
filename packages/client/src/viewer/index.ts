export { SessionViewer } from './SessionViewer';
export type { SessionViewerProps, SessionViewerOptions } from './SessionViewer';

export type { SecretMap } from './hooks/useReveal';

// Provisional secret placeholder token format (contract with PRD-06).
export {
  makeSecretToken,
  splitSecretTokens,
  hasSecretToken,
  secretTokenRegex,
  type SecretPlaceholder,
  type TextSegment,
} from './secret-token';

// Tool correlation (exposed for PRD-08 playback + tests).
export {
  correlateTools,
  useCorrelateTools,
  type RenderRow,
} from './hooks/useCorrelateTools';

// Demo fixture for the orchestrator to render/screenshot.
export { demoSession, demoSecretMap } from './demo';
