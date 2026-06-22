/**
 * @claudepad/registry-client - the framework-agnostic SDK for the registry
 * contract. Point it at any conformant registry; it hardwires no URL and
 * enforces the HTTPS-only guard at connect.
 */

export {
  RegistryClient,
  type RegistryClientOptions,
  type AuthTokenProvider,
  type FetchLike,
} from './client';

// Re-export the contract surface so consumers need a single import.
export * from '@claudepad/registry-spec';
