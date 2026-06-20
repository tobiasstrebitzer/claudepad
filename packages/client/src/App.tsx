import * as React from 'react';
import { AppShell } from './components/shell/AppShell';
import { Gallery } from './pages/Gallery';
import { SessionExperience } from './ingest';
import type { RecentItem } from './components/shell/Sidebar';

// Minimal hash router (PRD-01 §6.1: lightweight, single static bundle — works when
// served as one static asset). Full routing mechanics are confirmed in PRD-03.
function useHashRoute(): string {
  const [hash, setHash] = React.useState(() => window.location.hash || '#/');
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

// No persisted history in v1 (FR-18) — the sidebar's recent list is illustrative
// until an opt-in local cache lands (PRD-04 OQ-D).
const RECENT: RecentItem[] = [];

export function App() {
  const route = useHashRoute();
  const isGallery = route.startsWith('#/gallery');

  // Reflect the focused turn in the URL as a non-secret query param, without
  // polluting history (PRD-03 FR-17). Lives outside the hash so routing is intact.
  const onAnchorChange = React.useCallback((id: string) => {
    const url = `${window.location.pathname}?msg=${encodeURIComponent(id)}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, []);

  return (
    <AppShell
      route={route}
      recent={RECENT}
      title={isGallery ? 'Design system · Gallery' : undefined}
    >
      {isGallery ? <Gallery /> : <SessionExperience onAnchorChange={onAnchorChange} />}
    </AppShell>
  );
}
