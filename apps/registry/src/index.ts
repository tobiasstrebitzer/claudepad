/**
 * @claudepad/registry - reference implementation of the registry contract
 * (registry-spec.md). The Cloudflare Worker is the default export of
 * `./cloudflare`; the handler + in-memory backend are exported for tests, local
 * dev, and the SDK conformance suite.
 */

export { createRegistryHandler, type RegistryConfig } from './handler'
export { InMemoryBackend } from './memory'
export {
  type RegistryBackend,
  type BlobMeta,
  type BlobRecord,
  type SessionRecord,
  type OwnedEntry
} from './backend'
export { devBearerAuth, type AuthContext, type Authenticator } from './auth'
export { CloudflareBackend, manifestFromEnv, type Env } from './cloudflare'
export { default as worker } from './cloudflare'
