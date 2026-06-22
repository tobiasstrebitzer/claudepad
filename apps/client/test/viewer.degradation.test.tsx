import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Session, SessionEvent } from '@/schema';
import { SessionViewer, EventFilterProvider, DEFAULT_VISIBILITY } from '../src/viewer';
import { ContentBlocks } from '../src/viewer/components/blocks/ContentBlocks';
import { TopBar } from '../src/components/shell/TopBar';
import { sessionTopBar } from '../src/ingest';
import { TooltipProvider } from '../src/components/ui/Tooltip';

function session(events: SessionEvent[]): Session {
  return {
    id: 's',
    source: 'claude-code',
    formatVersion: 'test',
    meta: { title: 'T' },
    events,
  };
}

describe('graceful degradation (FR-7)', () => {
  it('renders a raw content block as a collapsible fallback without throwing', () => {
    expect(() =>
      render(<ContentBlocks blocks={[{ type: 'raw', value: { weird: true } }]} />),
    ).not.toThrow();
    expect(screen.getByText(/show raw JSON/i)).toBeInTheDocument();
  });

  it('renders a meta (unknown-kind) event as a note without crashing', () => {
    // Meta lands in the System group (off by default); enable it to exercise the
    // degradation render path.
    localStorage.setItem(
      'claudepad.eventFilter',
      JSON.stringify({ ...DEFAULT_VISIBILITY, system: true }),
    );
    render(
      <EventFilterProvider>
        <SessionViewer
          session={session([
            { kind: 'meta', note: 'Session compacted', subtype: 'compact', raw: { x: 1 } },
          ])}
          options={{ virtualize: false, showToc: false }}
        />
      </EventFilterProvider>,
    );
    expect(screen.getByText('Session compacted')).toBeInTheDocument();
    localStorage.clear();
  });

  it('does not render a broken image ref (shows placeholder, no img)', () => {
    const { container } = render(
      <ContentBlocks
        blocks={[{ type: 'image', ref: 'https://evil.example/x.png', encoding: 'url' }]}
      />,
    );
    // Remote refs are refused (offline guarantee) -> placeholder, no <img>.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/Image unavailable/i)).toBeInTheDocument();
  });
});

describe('header field omission (FR-14)', () => {
  it('omits absent meta fields without rendering "undefined"', () => {
    // The session header now lives in the unified top bar (D-49): the title is the
    // breadcrumb heading and the meta line omits absent fields.
    render(
      <TooltipProvider>
        <TopBar
          content={sessionTopBar({
            session: {
              id: 's',
              source: 'claude-code',
              formatVersion: 'test',
              meta: { title: 'Only a title' }, // no model/cwd/startedAt
              events: [{ kind: 'user', content: [{ type: 'text', text: 'hi' }] }],
            },
            diagnostics: [],
            viewMode: 'pretty',
            onViewMode: () => {},
            onClear: () => {},
            onHome: () => {},
          })}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Only a title' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('shows the empty state for a session with no events', () => {
    render(<SessionViewer session={session([])} options={{ virtualize: false }} />);
    expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument();
  });
});

describe('user/assistant distinction (FR-2)', () => {
  it('marks user and assistant turns with distinct accessible roles/labels', () => {
    render(
      <SessionViewer
        session={session([
          { kind: 'user', content: [{ type: 'text', text: 'hello' }] },
          {
            kind: 'assistant',
            model: 'opus',
            content: [{ type: 'text', text: 'hi there' }],
          },
        ])}
        options={{ virtualize: false, showToc: false }}
      />,
    );
    expect(screen.getByLabelText('User turn')).toBeInTheDocument();
    expect(screen.getByLabelText('Assistant turn')).toBeInTheDocument();
  });
});
