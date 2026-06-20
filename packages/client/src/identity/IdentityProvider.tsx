// A single identity instance shared across the app via context. The app shell
// renders the sidebar twice (desktop + mobile drawer) and the footer control
// lives in both, so prop-threading a hook would split state - context keeps one
// source of truth. Tests can pass a `storage` adapter to avoid real IndexedDB.

import * as React from 'react';
import { useIdentity, type IdentityApi } from './useIdentity';
import type { IdentityStorage } from './storage';

const IdentityContext = React.createContext<IdentityApi | null>(null);

export function IdentityProvider({
  storage,
  children,
}: {
  storage?: IdentityStorage;
  children: React.ReactNode;
}) {
  const api = useIdentity(storage);
  return <IdentityContext.Provider value={api}>{children}</IdentityContext.Provider>;
}

export function useIdentityContext(): IdentityApi {
  const ctx = React.useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentityContext must be used within an <IdentityProvider>.');
  }
  return ctx;
}
