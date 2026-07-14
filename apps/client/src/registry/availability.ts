// Launch gate (D-95): a registry only ever holds encrypted blobs, but that
// claim has not been independently reviewed yet, so production builds ship
// with the whole registry surface off and present it as coming soon. Dev
// builds keep it on (tests and local work are unaffected); a self-hosted
// production build can opt back in with VITE_REGISTRY_ENABLED=true at build
// time.
export const REGISTRY_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_REGISTRY_ENABLED === 'true'

export const REGISTRY_COMING_SOON_NOTE =
  'Registries hold only encrypted blobs they cannot read, but we want that design to pass an independent security review before switching them on.'
