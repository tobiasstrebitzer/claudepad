// Message protocol shared by the secret-scan Web Worker and its host hook
// (PRD-06 FR-10). The scanner is pure, so the worker just carries a Session in
// and Detection[] out, with progress in between. Cancellation = terminate the
// worker (no cooperative protocol needed).

import type { Session } from '@claudepad/schema'
import type { Detection, ScanSettings } from '@claudepad/secrets'

/** main -> worker: scan this session. */
export interface ScanRequest {
  session: Session
  settings?: ScanSettings
}

/** worker -> main. */
export type ScanResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; detections: Detection[] }
  | { type: 'error'; message: string }
