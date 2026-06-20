import * as React from 'react';
import { AppShell } from './components/shell/AppShell';
import { TooltipProvider } from './components/ui/tooltip';
import type { TopBarContent } from './components/shell/TopBar';
import type { ViewMode } from './components/shell/ViewSwitch';
import { Gallery } from './pages/Gallery';
import { SessionExperience, useSession, sessionTopBar } from './ingest';
import { RevealProvider, ExpandProvider, demoSecretMap } from './viewer';
import { IdentityProvider } from './identity';
import { ReceiveDialog, type OpenShareResult } from './share';
import { useVault, readSessionFile, type VaultSession } from './fs';
import type { SecretMap } from './viewer';
import type { RecentItem } from './components/shell/Sidebar';
import { Button } from './components/ui/button';
import { Inbox } from 'lucide-react';

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

// No persisted history in v1 (FR-18). On Chromium the sidebar is driven by a
// connected ~/.claude folder (see useVault); other browsers fall back to this
// (still empty) recent list.
const RECENT: RecentItem[] = [];

// On connect, auto-open the most recent session — but skip very large ones so the
// connect gesture stays instant (the user can still open them by hand).
const AUTO_OPEN_MAX_BYTES = 8 * 1024 * 1024;

export function App() {
  const route = useHashRoute();
  const isGallery = route.startsWith('#/gallery');

  const session = useSession();
  const vault = useVault();
  const [activeSessionId, setActiveSessionId] = React.useState<string>();
  const [viewMode, setViewMode] = React.useState<ViewMode>('pretty');
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  // Secret map from a decrypted body+secrets blob — drives high-priv reveal.
  const [receivedSecretMap, setReceivedSecretMap] = React.useState<SecretMap>();

  // Open a session straight from the connected folder (lazy read — contents are
  // only touched here, on click). Navigate home so the viewer is visible.
  const onSelectSession = React.useCallback(
    async (s: VaultSession) => {
      setActiveSessionId(s.id);
      if (window.location.hash.startsWith('#/gallery')) window.location.hash = '#/';
      const file = await readSessionFile(s);
      await session.loadFile(file, 'fs');
    },
    [session],
  );

  // "Overview" / "New / Open" returns to the empty drop/paste surface.
  const onHome = React.useCallback(() => {
    setActiveSessionId(undefined);
    setReceivedSecretMap(undefined);
    session.clear();
    if (window.location.hash.startsWith('#/gallery')) window.location.hash = '#/';
  }, [session]);

  // A decrypted blob → show its session in the viewer, with any granted secrets
  // feeding the high-priv reveal (body-only leaves the map undefined).
  const onReceived = React.useCallback(
    (result: OpenShareResult) => {
      setActiveSessionId(undefined);
      setReceivedSecretMap(result.secretMap ?? undefined);
      session.showSession(result.session, `share from ${result.from.name}`);
      setReceiveOpen(false);
      if (window.location.hash.startsWith('#/gallery')) window.location.hash = '#/';
    },
    [session],
  );

  // Keep the sidebar highlight + view mode in sync when the session is cleared.
  React.useEffect(() => {
    if (session.state.status === 'idle') {
      setActiveSessionId(undefined);
      setViewMode('pretty');
      setReceivedSecretMap(undefined);
    }
  }, [session.state.status]);

  // Derive-don't-ask: after the user connects a folder, drop them straight into
  // the most recent session (unless one's already open, or it's oversized).
  const autoOpenedEpoch = React.useRef(0);
  React.useEffect(() => {
    if (vault.userConnectEpoch === autoOpenedEpoch.current) return;
    autoOpenedEpoch.current = vault.userConnectEpoch;
    if (vault.userConnectEpoch === 0) return;
    if (session.state.status !== 'idle') return;
    const recent = vault.projects[0]?.sessions[0];
    if (recent && recent.size <= AUTO_OPEN_MAX_BYTES) void onSelectSession(recent);
  }, [vault.userConnectEpoch, vault.projects, session.state.status, onSelectSession]);

  // Reflect the focused turn in the URL as a non-secret query param, without
  // polluting history (PRD-03 FR-17). Lives outside the hash so routing is intact.
  const onAnchorChange = React.useCallback((id: string) => {
    const url = `${window.location.pathname}?msg=${encodeURIComponent(id)}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, []);

  const loaded = session.state.status === 'loaded' ? session.state : null;
  const isDemo = loaded?.fileName === 'sample-session.jsonl';
  const secretMap = isDemo ? demoSecretMap : receivedSecretMap;

  const topbar: TopBarContent = isGallery
    ? { crumbs: [{ label: 'Overview', onClick: onHome }, { label: 'Gallery' }] }
    : loaded
      ? sessionTopBar({
          session: loaded.session,
          diagnostics: loaded.diagnostics,
          fileName: loaded.fileName,
          viewMode,
          onViewMode: setViewMode,
          onClear: session.clear,
          onHome,
        })
      : {
          crumbs: [{ label: 'Overview' }],
          actions: (
            <Button size="sm" variant="secondary" onClick={() => setReceiveOpen(true)}>
              <Inbox />
              Open encrypted…
            </Button>
          ),
        };

  return (
    <TooltipProvider>
      <IdentityProvider>
        <RevealProvider secretMap={secretMap}>
          <ExpandProvider>
            <AppShell
              route={route}
              recent={RECENT}
              activeId={activeSessionId}
              onOpen={onHome}
              vault={
                vault.supported ? { ...vault, activeSessionId, onSelectSession } : undefined
              }
              topbar={topbar}
            >
              {isGallery ? (
                <Gallery />
              ) : (
                <SessionExperience
                  api={session}
                  viewMode={viewMode}
                  onAnchorChange={onAnchorChange}
                />
              )}
            </AppShell>
            <ReceiveDialog
              open={receiveOpen}
              onOpenChange={setReceiveOpen}
              onReceived={onReceived}
            />
          </ExpandProvider>
        </RevealProvider>
      </IdentityProvider>
    </TooltipProvider>
  );
}
