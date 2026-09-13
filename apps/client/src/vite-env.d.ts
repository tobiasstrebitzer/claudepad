/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 'true' switches the registry surface on in a production build. It is off
   * by default pending an independent security review (D-95); dev builds are
   * always on. See src/registry/availability.ts.
   */
  readonly VITE_REGISTRY_ENABLED?: string
  readonly VITE_QUOTA_PANEL?: string
}
