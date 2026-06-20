// Public surface of the trustless share/receive flow (PRD-11). The crypto lives
// in @claudepad/shared and redaction in @claudepad/secrets; this layer is the
// orchestration + UI.

export { createShare, openShare, type OpenShareResult } from './blob';
export { isShareBlob, CP_BLOB_PREFIX } from './detect';
export { ShareButton } from './ShareButton';
export { ShareDialog } from './ShareDialog';
export { ReceiveDialog } from './ReceiveDialog';
