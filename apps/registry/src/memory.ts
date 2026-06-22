/**
 * In-memory backend: the storage for tests, local dev, and the SDK conformance
 * suite. Deterministic and dependency-free; never used in production.
 */

import type { DirectoryEntry } from '@claudepad/registry-spec';
import type {
  BlobRecord,
  OwnedEntry,
  RegistryBackend,
  SessionRecord,
} from './backend';

export class InMemoryBackend implements RegistryBackend {
  private readonly blobs = new Map<string, BlobRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly directory = new Map<string, OwnedEntry>();

  async putBlob(id: string, record: BlobRecord): Promise<void> {
    this.blobs.set(id, record);
  }

  async getBlob(id: string): Promise<BlobRecord | null> {
    return this.blobs.get(id) ?? null;
  }

  async deleteBlob(id: string): Promise<boolean> {
    return this.blobs.delete(id);
  }

  async listInbox(inboxKey: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [id, record] of this.blobs) {
      if (record.meta.indexFor?.includes(inboxKey)) ids.push(id);
    }
    return ids;
  }

  async putSession(id: string, record: SessionRecord): Promise<void> {
    this.sessions.set(id, record);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async searchDirectory(query: string): Promise<DirectoryEntry[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: DirectoryEntry[] = [];
    for (const { entry } of this.directory.values()) {
      if (entry.handle.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q)) {
        out.push(entry);
      }
    }
    return out;
  }

  async resolveIdentity(handle: string): Promise<OwnedEntry | null> {
    return this.directory.get(handle) ?? null;
  }

  async putIdentity(entry: OwnedEntry): Promise<void> {
    this.directory.set(entry.entry.handle, entry);
  }

  async deleteIdentity(handle: string): Promise<boolean> {
    return this.directory.delete(handle);
  }
}
