/**
 * @claudepad/registry-spec - the open registry contract (registry-spec.md).
 *
 * Provider interfaces, wire DTOs, endpoint constants, the TLS-only guard, a
 * tolerant manifest parser, typed errors, and the OpenAPI document. Zero runtime
 * dependencies; implemented by any conformant registry and consumed by the SDK.
 */

export * from './store'
export * from './directory'
export * from './manifest'
export * from './provider'
export * from './transport'
export * from './paths'
export * from './errors'
export * from './guards'
// NOTE: OPENAPI_DOCUMENT is intentionally NOT re-exported here. It's a
// server/tooling concern, and its example.com server URLs would trip the
// client's no-external-origins gate if bundled. Import from
// `@claudepad/registry-spec/openapi` where actually needed (the reference impl).
