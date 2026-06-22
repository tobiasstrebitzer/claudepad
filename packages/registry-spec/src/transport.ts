/**
 * Over-the-wire JSON shapes (REGISTRY-SPEC.md §7). The provider interface deals
 * in rich values (Uint8Array, parsed entries); these are what actually crosses
 * the wire. Blob bodies are raw octet-stream; everything else is JSON.
 */

import type { AssuranceLevel, DirectoryEntry } from './directory';

/** Response to a blob/session PUT. */
export interface PutResponse {
  id: string;
  url?: string;
}

/** Response to a directory search. */
export interface DirectorySearchResponse {
  entries: DirectoryEntry[];
}

/** Request body for publishing/claiming an identity card. */
export interface PublishIdentityRequest {
  /** cp-pub-… public-key card. */
  card: string;
  /** Handle the caller wants; the registry may scope/override it. */
  handle?: string;
  /** Assurance the caller claims; the registry verifies and may downgrade it. */
  assurance?: AssuranceLevel;
}

/** Response listing inbox ids addressed to the authenticated identity. */
export interface InboxResponse {
  ids: string[];
}
