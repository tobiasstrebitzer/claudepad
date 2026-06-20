// Public API for the client-side secret detection + redaction core (PRD-06).
// Pure and isomorphic: no DOM, no network, no persistence. The review UI and the
// share flow (PRD-11) consume these.

export {
  type SignalKind,
  type DetectionState,
  type Detection,
  type SecretEntry,
  type SecretMap,
  type ScanSettings,
  type RedactionResult,
  DEFAULT_SCAN_SETTINGS,
} from './model';

export { scanSession } from './scan';
export { redact, findLeakedValues } from './redact';
export { collectStrings, mapSessionStrings } from './text';
export { makeSecretToken, sanitizeType, neutralizeSentinels } from './placeholder';
export { shannonEntropy, parseEnv } from './detectors';
