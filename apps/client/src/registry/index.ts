// Optional registry integration (REGISTRY-SPEC.md) - opt-in, null by default.
// The crypto/contract live in @claudepad/registry-client; this layer is the
// React wiring + UI.

export { RegistryProvider, useRegistry, type RegistryApi, type RegistryState } from './RegistryProvider'
export { RegistryControl } from './RegistryControl'
export { pubHash } from './pubHash'
export { fetchSharedBlob } from './sharedBlob'
export { DEFAULT_REGISTRY_URL, DEFAULT_REGISTRY_LABEL } from './defaults'
