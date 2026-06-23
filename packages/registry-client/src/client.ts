/**
 * RegistryClient - a fetch-based implementation of {@link RegistryProvider} that
 * talks to ANY conformant registry (REGISTRY-SPEC.md). It hardwires no URL: you
 * point it at a registry you choose, and the HTTPS-only guard (D-77) is enforced
 * at connect. Inject `fetch` for tests/SSR.
 */

import {
  assertAllowedRegistryUrl,
  BLOB_CONTENT_TYPE,
  DIRECTORY_QUERY_PARAM,
  INDEX_FOR_HEADER,
  isErrorBody,
  MANIFEST_PATH,
  parseManifest,
  REGISTRY_PATHS,
  RegistryError,
  type DirectoryEntry,
  type DirectorySearchResponse,
  type InboxResponse,
  type PublishIdentityRequest,
  type PutResponse,
  type RegistryManifest,
  type RegistryProvider,
  type RegistryPutOptions,
  type StoreCapabilities,
  type StorePutOptions,
  type StoredRef
} from '@claudepad/registry-spec'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Returns a bearer token for authenticated routes (inbox, sessions, directory writes). */
export type AuthTokenProvider = () => string | null | Promise<string | null>

export interface RegistryClientOptions {
  fetch?: FetchLike
  /** Token for authenticated routes; omit for a read-only/anonymous client. */
  getAuthToken?: AuthTokenProvider
}

export class RegistryClient implements RegistryProvider {
  readonly manifest: RegistryManifest
  private readonly fetchImpl: FetchLike
  private readonly getAuthToken?: AuthTokenProvider

  constructor(manifest: RegistryManifest, options: RegistryClientOptions = {}) {
    assertAllowedRegistryUrl(manifest.baseUrl)
    this.manifest = manifest
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.getAuthToken = options.getAuthToken
  }

  /** Fetch + validate the manifest, then build a client. Rejects a non-TLS registry. */
  static async connect(baseUrl: string, options: RegistryClientOptions = {}): Promise<RegistryClient> {
    assertAllowedRegistryUrl(baseUrl)
    const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    const res = await fetchImpl(joinUrl(baseUrl, MANIFEST_PATH))
    if (!res.ok) throw new RegistryError('server_error', `Manifest fetch failed (${res.status})`)
    const manifest = parseManifest(await res.json())
    return new RegistryClient(manifest, options)
  }

  get id(): string {
    return this.manifest.id
  }
  get baseUrl(): string {
    return this.manifest.baseUrl
  }
  get capabilities(): StoreCapabilities {
    return this.manifest.store
  }

  // --- Availability (zero-knowledge blobs) ---

  async put(blob: Uint8Array, opts: RegistryPutOptions = {}): Promise<StoredRef> {
    const params = new URLSearchParams()
    if (opts.expiresInSeconds !== undefined) {
      params.set('expiresInSeconds', String(opts.expiresInSeconds))
    }
    if (opts.burnAfterRead) params.set('burnAfterRead', 'true')
    const query = params.toString()
    const headers: Record<string, string> = { 'content-type': BLOB_CONTENT_TYPE }
    if (opts.indexFor?.length) headers[INDEX_FOR_HEADER] = opts.indexFor.join(',')

    const res = await this.fetchImpl(
      this.url(REGISTRY_PATHS.blobs + (query ? `?${query}` : '')),
      // A fresh ArrayBuffer view keeps the body a plain BodyInit across runtimes.
      { method: 'POST', headers, body: blob.slice() }
    )
    const json = await this.ok<PutResponse>(res)
    return { id: json.id, ...(json.url ? { url: json.url } : {}) }
  }

  async get(id: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.blob(id)))
    await this.throwIfError(res)
    return new Uint8Array(await res.arrayBuffer())
  }

  async deleteBlob(id: string): Promise<void> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.blob(id)), { method: 'DELETE' })
    await this.throwIfError(res)
  }

  async inbox(): Promise<string[]> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.inbox), {
      headers: await this.authHeaders()
    })
    return (await this.ok<InboxResponse>(res)).ids
  }

  // --- Authenticity (directory) ---

  async lookup(query: string): Promise<DirectoryEntry[]> {
    const params = new URLSearchParams({ [DIRECTORY_QUERY_PARAM]: query })
    const res = await this.fetchImpl(this.url(`${REGISTRY_PATHS.directory}?${params.toString()}`))
    if (res.status === 404) return []
    return (await this.ok<DirectorySearchResponse>(res)).entries
  }

  async resolve(handle: string): Promise<DirectoryEntry | null> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.directoryEntry(handle)))
    if (res.status === 404) return null
    return this.ok<DirectoryEntry>(res)
  }

  async publishIdentity(card: string, opts: Omit<PublishIdentityRequest, 'card'> = {}): Promise<DirectoryEntry> {
    const body: PublishIdentityRequest = { card, ...opts }
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.directory), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify(body)
    })
    return this.ok<DirectoryEntry>(res)
  }

  async revokeIdentity(handle: string): Promise<void> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.directoryEntry(handle)), {
      method: 'DELETE',
      headers: await this.authHeaders()
    })
    await this.throwIfError(res)
  }

  // --- Trusted mode (readable sessions) ---

  async putSession(session: unknown, _opts?: StorePutOptions): Promise<StoredRef> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.sessions), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.authHeaders()) },
      body: JSON.stringify(session)
    })
    const json = await this.ok<PutResponse>(res)
    return { id: json.id, ...(json.url ? { url: json.url } : {}) }
  }

  async getSession(id: string): Promise<unknown> {
    const res = await this.fetchImpl(this.url(REGISTRY_PATHS.session(id)), {
      headers: await this.authHeaders()
    })
    return this.ok<unknown>(res)
  }

  // --- internals ---

  private url(path: string): string {
    return joinUrl(this.manifest.baseUrl, path)
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = this.getAuthToken ? await this.getAuthToken() : null
    if (!token) throw new RegistryError('unauthorized', 'This action requires an auth token')
    return { authorization: `Bearer ${token}` }
  }

  private async ok<T>(res: Response): Promise<T> {
    await this.throwIfError(res)
    return (await res.json()) as T
  }

  private async throwIfError(res: Response): Promise<void> {
    if (res.ok) return
    let body: unknown
    try {
      body = await res.clone().json()
    } catch {
      body = undefined
    }
    if (isErrorBody(body)) throw new RegistryError(body.error.code, body.error.message)
    throw new RegistryError('server_error', `Request failed (${res.status})`)
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`
}
