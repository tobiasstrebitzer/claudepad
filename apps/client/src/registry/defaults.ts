// The recommended registry (D-88, relaxes D-33). claudepad still ships no
// *automatic* server dependency - sharing works fully offline - but to make
// getting started easy we recommend our own hosted registry as a one-click
// (opt-out) default during onboarding and in the registry popover. The URL is
// allow-listed in scripts/check-no-external-origins.mjs; it's only ever fetched
// after the user opts in.

export const DEFAULT_REGISTRY_URL = 'https://registry.claudepad.io'
export const DEFAULT_REGISTRY_LABEL = 'registry.claudepad.io'
