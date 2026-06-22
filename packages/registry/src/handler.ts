/**
 * The registry contract logic (REGISTRY-SPEC.md §7), as a pure
 * `(Request) => Promise<Response>` over a {@link RegistryBackend}. Storage and
 * runtime are injected, so the same handler serves the Cloudflare Worker and the
 * in-memory test/conformance backend.
 */

import {
  BLOB_CONTENT_TYPE,
  DIRECTORY_QUERY_PARAM,
  INDEX_FOR_HEADER,
  MANIFEST_PATH,
  REGISTRY_PATHS,
  RegistryError,
  registrySupportsMode,
  type DirectoryEntry,
  type DirectorySearchResponse,
  type InboxResponse,
  type PublishIdentityRequest,
  type PutResponse,
  type RegistryManifest,
} from '@claudepad/registry-spec';
import { OPENAPI_DOCUMENT } from '@claudepad/registry-spec/openapi';
import { decodePublicCard, fingerprint } from '@claudepad/shared';
import type { AuthContext, Authenticator } from './auth';
import { devBearerAuth } from './auth';
import type { BlobMeta, RegistryBackend } from './backend';

const CP_PUB_PREFIX = 'cp-pub-';

export interface RegistryConfig {
  manifest: RegistryManifest;
  /** Defaults to {@link devBearerAuth} (reference-grade). */
  authenticate?: Authenticator;
  /** Override id generation (tests). Defaults to crypto.randomUUID(). */
  generateId?: () => string;
  /** Override the clock (tests). Defaults to Date.now(). */
  now?: () => number;
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof RegistryError) return json(err.status, err.toBody());
  const message = err instanceof Error ? err.message : String(err);
  return json(500, { error: { code: 'server_error', message } });
}

export function createRegistryHandler(
  backend: RegistryBackend,
  config: RegistryConfig,
): (request: Request) => Promise<Response> {
  const authenticate = config.authenticate ?? devBearerAuth;
  const generateId = config.generateId ?? (() => globalThis.crypto.randomUUID());
  const now = config.now ?? (() => Date.now());
  const { manifest } = config;

  async function requireAuth(request: Request): Promise<AuthContext> {
    const auth = await authenticate(request);
    if (!auth) throw new RegistryError('unauthorized', 'Authentication required');
    return auth;
  }

  function blobUrl(id: string): string {
    return `${manifest.baseUrl.replace(/\/$/, '')}${REGISTRY_PATHS.blob(id)}`;
  }
  function sessionUrl(id: string): string {
    return `${manifest.baseUrl.replace(/\/$/, '')}${REGISTRY_PATHS.session(id)}`;
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    // --- Discovery ---
    if (method === 'GET' && (path === MANIFEST_PATH || path === REGISTRY_PATHS.manifest)) {
      return json(200, manifest);
    }
    if (method === 'GET' && path === REGISTRY_PATHS.openapi) {
      return json(200, OPENAPI_DOCUMENT);
    }

    // --- Blobs (zero-knowledge) ---
    if (path === REGISTRY_PATHS.blobs && method === 'POST') {
      const bytes = new Uint8Array(await request.arrayBuffer());
      const max = manifest.store.maxBytes;
      if (max !== undefined && bytes.byteLength > max) {
        throw new RegistryError('payload_too_large', `Blob exceeds maxBytes (${max})`);
      }
      const meta: BlobMeta = {};
      const expires = url.searchParams.get('expiresInSeconds');
      if (expires && manifest.store.expiry) meta.expiresAt = now() + Number(expires) * 1000;
      if (url.searchParams.get('burnAfterRead') === 'true' && manifest.store.burnAfterRead) {
        meta.burnAfterRead = true;
      }
      const indexHeader = request.headers.get(INDEX_FOR_HEADER);
      if (indexHeader) {
        meta.indexFor = indexHeader.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const id = generateId();
      await backend.putBlob(id, { bytes, meta });
      return json(201, { id, url: blobUrl(id) } satisfies PutResponse);
    }

    const blobMatch = /^\/blobs\/([^/]+)$/.exec(path);
    if (blobMatch) {
      const id = decodeURIComponent(blobMatch[1] ?? '');
      if (method === 'GET') {
        const record = await backend.getBlob(id);
        if (!record) throw new RegistryError('not_found', 'No such blob');
        if (record.meta.expiresAt !== undefined && record.meta.expiresAt <= now()) {
          await backend.deleteBlob(id);
          throw new RegistryError('gone', 'Blob expired');
        }
        if (record.meta.burnAfterRead) await backend.deleteBlob(id);
        return new Response(record.bytes, {
          status: 200,
          headers: { 'content-type': BLOB_CONTENT_TYPE, ...CORS_HEADERS },
        });
      }
      if (method === 'DELETE') {
        if (!manifest.store.delete) throw new RegistryError('forbidden', 'Delete not supported');
        const ok = await backend.deleteBlob(id);
        if (!ok) throw new RegistryError('not_found', 'No such blob');
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
    }

    if (path === REGISTRY_PATHS.inbox && method === 'GET') {
      const auth = await requireAuth(request);
      const ids = await backend.listInbox(auth.id);
      return json(200, { ids } satisfies InboxResponse);
    }

    // --- Sessions (trusted mode) ---
    if (path === REGISTRY_PATHS.sessions && method === 'POST') {
      if (!registrySupportsMode(manifest, 'trusted')) {
        throw new RegistryError('mode_unsupported', 'This registry is zero-knowledge only');
      }
      const auth = await requireAuth(request);
      const body = await request.json();
      const id = generateId();
      await backend.putSession(id, { json: body, owner: auth.id });
      return json(201, { id, url: sessionUrl(id) } satisfies PutResponse);
    }

    const sessionMatch = /^\/sessions\/([^/]+)$/.exec(path);
    if (sessionMatch) {
      if (!registrySupportsMode(manifest, 'trusted')) {
        throw new RegistryError('mode_unsupported', 'This registry is zero-knowledge only');
      }
      const id = decodeURIComponent(sessionMatch[1] ?? '');
      const auth = await requireAuth(request);
      const record = await backend.getSession(id);
      if (!record) throw new RegistryError('not_found', 'No such session');
      if (record.owner !== auth.id) throw new RegistryError('forbidden', 'Not your session');
      if (method === 'GET') return json(200, record.json);
      if (method === 'DELETE') {
        await backend.deleteSession(id);
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
    }

    // --- Directory ---
    if (path === REGISTRY_PATHS.directory) {
      if (!manifest.directory?.enabled) {
        throw new RegistryError('directory_disabled', 'No directory on this registry');
      }
      if (method === 'GET') {
        const q = url.searchParams.get(DIRECTORY_QUERY_PARAM);
        if (q === null) throw new RegistryError('bad_request', 'Missing ?q=');
        const entries = await backend.searchDirectory(q);
        return json(200, { entries } satisfies DirectorySearchResponse);
      }
      if (method === 'POST') {
        const auth = await requireAuth(request);
        const entry = await publishIdentity(await request.json(), auth, backend);
        return json(201, entry);
      }
    }

    const dirMatch = /^\/directory\/([^/]+)$/.exec(path);
    if (dirMatch) {
      if (!manifest.directory?.enabled) {
        throw new RegistryError('directory_disabled', 'No directory on this registry');
      }
      const handle = decodeURIComponent(dirMatch[1] ?? '');
      if (method === 'GET') {
        const owned = await backend.resolveIdentity(handle);
        if (!owned) throw new RegistryError('not_found', 'No such identity');
        return json(200, owned.entry);
      }
      if (method === 'DELETE') {
        const auth = await requireAuth(request);
        const owned = await backend.resolveIdentity(handle);
        if (!owned) throw new RegistryError('not_found', 'No such identity');
        if (owned.owner !== auth.id) throw new RegistryError('forbidden', 'Not your handle');
        await backend.deleteIdentity(handle);
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
    }

    throw new RegistryError('not_found', `No route for ${method} ${path}`);
  }

  return async (request: Request): Promise<Response> => {
    try {
      return await route(request);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * Publish/claim a card. The registry derives the fingerprint authoritatively
 * from the card (anti-spoof) and - having no domain/SSO verifier - issues only
 * `self` assurance regardless of what the caller claimed (honest by D-76).
 */
async function publishIdentity(
  body: unknown,
  auth: AuthContext,
  backend: RegistryBackend,
): Promise<DirectoryEntry> {
  const req = body as PublishIdentityRequest;
  if (!req || typeof req.card !== 'string') {
    throw new RegistryError('bad_request', 'Missing card');
  }
  const cardBody = req.card.startsWith(CP_PUB_PREFIX)
    ? req.card.slice(CP_PUB_PREFIX.length)
    : req.card;

  let pub: string;
  let name: string;
  try {
    const decoded = decodePublicCard(cardBody);
    pub = decoded.pub;
    name = decoded.name;
  } catch {
    throw new RegistryError('bad_request', 'Malformed public card');
  }

  const handle = (req.handle ?? name).trim();
  if (!handle) throw new RegistryError('bad_request', 'Empty handle');

  const existing = await backend.resolveIdentity(handle);
  if (existing && existing.owner !== auth.id) {
    throw new RegistryError('conflict', 'Handle already claimed by another key');
  }

  const fp = await fingerprint(pub);
  const entry: DirectoryEntry = {
    handle,
    name,
    pub,
    fingerprint: `${fp.emoji}  ${fp.code}`,
    assurance: 'self',
  };
  await backend.putIdentity({ entry, owner: auth.id });
  return entry;
}
