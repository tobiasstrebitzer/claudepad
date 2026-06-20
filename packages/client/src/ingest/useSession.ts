import * as React from 'react';
import { parseSession, type Session, type DiagnosticRecord } from '@claudepad/schema';
import { classify, checkSize, type IngestShape } from '@claudepad/ingest';
import { isShareBlob } from '../share/detect';

// Browser ingest state machine (PRD-04). Local-only by default: acquiring a session
// makes zero network requests and persists nothing (FR-3/FR-18). Sharing is a separate,
// explicit P3 action - never a side effect of loading (FR-23).

export type IngestSource = 'drop' | 'paste' | 'file-picker' | 'fs';

export type SessionState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | {
      status: 'loaded';
      session: Session;
      diagnostics: DiagnosticRecord[];
      fileName?: string;
      bytes: number;
    }
  | { status: 'rejected'; reason: string; got: IngestShape }
  | { status: 'oversize'; bytes: number; pending: PendingInput }
  | { status: 'too-large'; bytes: number }
  | { status: 'error'; message: string };

type PendingInput = { text: string; bytes: number; fileName?: string };

export interface SessionApi {
  state: SessionState;
  loadFile: (file: File, source?: IngestSource) => Promise<void>;
  loadText: (text: string, source?: IngestSource) => Promise<void>;
  /** Load an already-built Session (e.g. the bundled demo) without re-parsing. */
  showSession: (session: Session, fileName?: string) => void;
  confirmOversize: () => Promise<void>;
  clear: () => void;
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

export interface UseSessionOpts {
  /**
   * Called when an ingested payload is an encrypted share (`cp-blob-…`) rather
   * than a session. The drop/paste/file-picker surfaces accept both; a blob is
   * handed off to the receive→decrypt flow instead of the parser (it never
   * touches session state). Without a handler, a blob falls through to the
   * normal "not a session" rejection.
   */
  onShareBlob?: (blob: string) => void;
}

export function useSession(opts: UseSessionOpts = {}): SessionApi {
  const [state, setState] = React.useState<SessionState>({ status: 'idle' });

  // Keep the latest handler without re-creating the ingest callback (which
  // would churn the paste/drop wiring downstream).
  const onShareBlob = opts.onShareBlob;
  const onShareBlobRef = React.useRef(onShareBlob);
  React.useEffect(() => {
    onShareBlobRef.current = onShareBlob;
  }, [onShareBlob]);

  const ingest = React.useCallback(
    async (text: string, bytes: number, fileName?: string, confirmed = false) => {
      // An encrypted share routes to decrypt, not the parser - checked before the
      // size caps (those bound the session parser, not opaque ciphertext).
      if (onShareBlobRef.current && isShareBlob(text)) {
        onShareBlobRef.current(text.trim());
        return;
      }
      const verdict = checkSize(bytes);
      if (verdict.overHardCap) {
        setState({ status: 'too-large', bytes });
        return;
      }
      const shape = classify(text);
      if (shape === 'unknown') {
        setState({
          status: 'rejected',
          got: shape,
          reason:
            'No JSON lines detected - this doesn’t look like a Claude Code session.',
        });
        return;
      }
      if (verdict.overSoftCap && !confirmed) {
        setState({ status: 'oversize', bytes, pending: { text, bytes, fileName } });
        return;
      }
      setState({ status: 'parsing' });
      try {
        const result = await parseSession(text, { source: 'auto' });
        setState({
          status: 'loaded',
          session: result.session,
          diagnostics: result.diagnostics,
          fileName,
          bytes,
        });
      } catch (err) {
        // parseSession is contractually non-throwing (FR-24); this is a belt-and-braces guard.
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not parse this session.',
        });
      }
    },
    [],
  );

  const loadText = React.useCallback(
    async (text: string, _source: IngestSource = 'paste') => {
      await ingest(text, byteLength(text));
    },
    [ingest],
  );

  const loadFile = React.useCallback(
    async (file: File, _source: IngestSource = 'drop') => {
      // Read the whole file as text (the 25MB soft cap keeps this bounded; a
      // streaming path for very large files is a documented FR-17 follow-up).
      const text = await file.text();
      await ingest(text, file.size, file.name);
    },
    [ingest],
  );

  const confirmOversize = React.useCallback(async () => {
    setState((s) => {
      if (s.status !== 'oversize') return s;
      // re-run ingest with confirmation
      void ingest(s.pending.text, s.pending.bytes, s.pending.fileName, true);
      return { status: 'parsing' };
    });
  }, [ingest]);

  const showSession = React.useCallback((session: Session, fileName?: string) => {
    setState({ status: 'loaded', session, diagnostics: [], fileName, bytes: 0 });
  }, []);

  const clear = React.useCallback(() => setState({ status: 'idle' }), []);

  return { state, loadFile, loadText, showSession, confirmOversize, clear };
}
