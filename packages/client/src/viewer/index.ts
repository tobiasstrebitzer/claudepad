export { SessionViewer } from './SessionViewer';
export type { SessionViewerProps, SessionViewerOptions } from './SessionViewer';
export { RawSessionView } from './components/RawSessionView';

// View providers + controls - mounted at the app root (D-49) so the unified top
// bar can host the secrets/expand controls above the transcript.
export { RevealProvider, type SecretMap } from './hooks/useReveal';
export { ExpandProvider } from './hooks/useExpand';
export { SecretsControl, ExpandControl } from './components/SessionControls';
export { EventFilterControl } from './components/EventFilterControl';

// Event-group filter - shared by the viewer and the playback engine (D-63).
export { EventFilterProvider, useEventFilter } from './hooks/useEventFilter';
export {
  filterRows,
  rowGroup,
  DEFAULT_VISIBILITY,
  ALL_VISIBLE,
  EVENT_GROUPS,
  type EventGroup,
  type EventVisibility,
} from './hooks/eventFilter';

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
