export { useSession } from './useSession'
export type { SessionApi, SessionState, IngestSource } from './useSession'
export { SessionExperience } from './SessionExperience'
export { DropZone } from './DropZone'
export { EmptyState } from './EmptyState'
export { sessionTopBar } from './SessionChrome'
export { usePasteCapture } from './usePasteCapture'
export { useCopy } from './useCopy'
export { RejectionPanel, OversizePanel, TooLargePanel, ErrorPanel } from './panels'

// Ingest lib (formerly @claudepad/ingest): tolerant detection, size caps,
// onboarding paths, and session-meta extraction. Client-only, so it lives here.
export * from './types'
export { classify, isIngestible } from './detect'
export { onboardingPaths, allOnboarding, detectOS } from './onboarding'
export { DEFAULT_CAPS, STREAMING_THRESHOLD, checkSize, formatBytes } from './limits'
export { extractSessionMeta, cleanTitleText, type SessionFileMeta } from './session-meta'
