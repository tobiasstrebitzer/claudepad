/**
 * Cloudflare adapter: R2 holds opaque blob bytes (+ meta in customMetadata); KV
 * holds the directory, trusted sessions, and the inbox reverse-index. Minimal
 * binding interfaces are declared locally so the package builds without the
 * @cloudflare/workers-types dependency.
 */

import type { DirectoryEntry, RegistryManifest, RegistryMode } from '@claudepad/registry-spec';
import { createRegistryHandler } from './handler';
import type { BlobRecord, OwnedEntry, RegistryBackend, SessionRecord } from './backend';

interface R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
}
interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}
interface KVListResult {
  keys: { name: string }[];
}
interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<KVListResult>;
}

const INBOX_PREFIX = 'inbox:';
const SESSION_PREFIX = 'session:';
const DIR_PREFIX = 'dir:';

export class CloudflareBackend implements RegistryBackend {
  constructor(
    private readonly blobs: R2BucketLike,
    private readonly kv: KVNamespaceLike,
  ) {}

  async putBlob(id: string, record: BlobRecord): Promise<void> {
    await this.blobs.put(id, record.bytes, {
      customMetadata: { meta: JSON.stringify(record.meta) },
    });
    for (const key of record.meta.indexFor ?? []) {
      await this.kv.put(`${INBOX_PREFIX}${key}:${id}`, '1');
    }
  }

  async getBlob(id: string): Promise<BlobRecord | null> {
    const obj = await this.blobs.get(id);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const meta = obj.customMetadata?.['meta'];
    return { bytes, meta: meta ? JSON.parse(meta) : {} };
  }

  async deleteBlob(id: string): Promise<boolean> {
    const existing = await this.getBlob(id);
    if (!existing) return false;
    for (const key of existing.meta.indexFor ?? []) {
      await this.kv.delete(`${INBOX_PREFIX}${key}:${id}`);
    }
    await this.blobs.delete(id);
    return true;
  }

  async listInbox(inboxKey: string): Promise<string[]> {
    const prefix = `${INBOX_PREFIX}${inboxKey}:`;
    const { keys } = await this.kv.list({ prefix });
    return keys.map((k) => k.name.slice(prefix.length));
  }

  async putSession(id: string, record: SessionRecord): Promise<void> {
    await this.kv.put(`${SESSION_PREFIX}${id}`, JSON.stringify(record));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const raw = await this.kv.get(`${SESSION_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  async deleteSession(id: string): Promise<boolean> {
    const raw = await this.kv.get(`${SESSION_PREFIX}${id}`);
    if (!raw) return false;
    await this.kv.delete(`${SESSION_PREFIX}${id}`);
    return true;
  }

  async searchDirectory(query: string): Promise<DirectoryEntry[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const { keys } = await this.kv.list({ prefix: DIR_PREFIX });
    const out: DirectoryEntry[] = [];
    for (const k of keys) {
      const raw = await this.kv.get(k.name);
      if (!raw) continue;
      const { entry } = JSON.parse(raw) as OwnedEntry;
      if (entry.handle.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q)) {
        out.push(entry);
      }
    }
    return out;
  }

  async resolveIdentity(handle: string): Promise<OwnedEntry | null> {
    const raw = await this.kv.get(`${DIR_PREFIX}${handle}`);
    return raw ? (JSON.parse(raw) as OwnedEntry) : null;
  }

  async putIdentity(entry: OwnedEntry): Promise<void> {
    await this.kv.put(`${DIR_PREFIX}${entry.entry.handle}`, JSON.stringify(entry));
  }

  async deleteIdentity(handle: string): Promise<boolean> {
    const raw = await this.kv.get(`${DIR_PREFIX}${handle}`);
    if (!raw) return false;
    await this.kv.delete(`${DIR_PREFIX}${handle}`);
    return true;
  }
}

export interface Env {
  BLOBS: R2BucketLike;
  KV: KVNamespaceLike;
  REGISTRY_ID?: string;
  REGISTRY_NAME?: string;
  REGISTRY_BASE_URL?: string;
  REGISTRY_MODES?: string;
  REGISTRY_DIRECTORY?: string;
  REGISTRY_TRUSTED_AT_REST?: string;
  REGISTRY_MAX_BYTES?: string;
}

const KNOWN_MODES: ReadonlySet<RegistryMode> = new Set<RegistryMode>([
  'zero-knowledge',
  'trusted',
]);

export function manifestFromEnv(env: Env): RegistryManifest {
  const baseUrl = env.REGISTRY_BASE_URL ?? 'https://registry.example.com';
  const modes = (env.REGISTRY_MODES ?? 'zero-knowledge')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is RegistryMode => KNOWN_MODES.has(s as RegistryMode));
  const manifest: RegistryManifest = {
    id: env.REGISTRY_ID ?? 'claudepad-registry-reference',
    name: env.REGISTRY_NAME ?? 'claudepad reference registry',
    baseUrl,
    tls: 'required',
    modes: modes.length ? modes : ['zero-knowledge'],
    store: {
      expiry: true,
      burnAfterRead: true,
      delete: true,
      ...(env.REGISTRY_MAX_BYTES ? { maxBytes: Number(env.REGISTRY_MAX_BYTES) } : {}),
    },
  };
  if (env.REGISTRY_DIRECTORY === 'true') {
    manifest.directory = { enabled: true, assurance: ['self'] };
  }
  if (env.REGISTRY_TRUSTED_AT_REST) manifest.trustedAtRest = env.REGISTRY_TRUSTED_AT_REST;
  return manifest;
}

/** The Cloudflare Worker entry point. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const backend = new CloudflareBackend(env.BLOBS, env.KV);
    const handler = createRegistryHandler(backend, { manifest: manifestFromEnv(env) });
    return handler(request);
  },
};
