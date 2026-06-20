import * as React from 'react';
import { AppShell } from './components/shell/AppShell';
import { Button } from './components/ui/button';
import { Share2 } from 'lucide-react';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
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

const RECENT: RecentItem[] = [
  { id: 'a', title: 'Fix Google OAuth redirect URI configuration' },
  { id: 'b', title: 'Scaffold the claudepad monorepo' },
  { id: 'c', title: 'Tolerant JSONL parser design' },
  { id: 'd', title: 'Encrypt-to-recipient sealed box' },
];

export function App() {
  const route = useHashRoute();
  const [activeId, setActiveId] = React.useState<string | undefined>('a');

  const isGallery = route.startsWith('#/gallery');

  return (
    <AppShell
      route={route}
      recent={RECENT}
      activeId={isGallery ? undefined : activeId}
      onSelect={setActiveId}
      title={
        isGallery
          ? 'Design system · Gallery'
          : 'Fix Google OAuth redirect URI configuration'
      }
      actions={
        !isGallery && (
          <Button size="sm" variant="primary">
            <Share2 />
            Share
          </Button>
        )
      }
    >
      {isGallery ? <Gallery /> : <Home />}
    </AppShell>
  );
}
