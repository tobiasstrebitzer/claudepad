// Client-side session playback (PRD-08). A small module beside the viewer: a
// pure timeline engine + a rAF clock + transport UI that reuses PRD-03's
// renderer (no fork). No network, no crypto - consumes the in-memory Session.

export { PlaybackProvider, usePlayback } from './PlaybackProvider';
export type { PlaybackContextValue, PlaybackStatus } from './PlaybackProvider';
export { TransportBar } from './TransportBar';
export { PlayToggleButton } from './PlayToggleButton';
export {
  buildTimeline,
  resolveFrame,
  rowStartMs,
  stepTargetMs,
  segIndexAt,
  type Timeline,
  type Segment,
  type SegKind,
  type PlaybackMode,
  type PlaybackFrame,
} from './buildTimeline';
export {
  DEFAULT_PACING,
  SPEEDS,
  TYPING_BUFFER_RATIO,
  type PacingConfig,
  type Speed,
  type AppearMode,
} from './pacing';
