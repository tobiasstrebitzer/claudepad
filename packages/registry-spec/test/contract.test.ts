import { describe, expect, it } from 'vitest';
import {
  ERROR_STATUS,
  isVerifiedAssurance,
  REGISTRY_PATHS,
  registryHasDirectory,
  registrySupportsMode,
  type RegistryManifest,
} from '../src/index';
import { OPENAPI_DOCUMENT } from '../src/openapi';

const manifest: RegistryManifest = {
  id: 'r',
  name: 'R',
  baseUrl: 'https://r.example.com',
  tls: 'required',
  modes: ['zero-knowledge'],
  directory: { enabled: true, assurance: ['self', 'domain'] },
  store: { expiry: false, burnAfterRead: false, delete: true },
};

describe('manifest helpers', () => {
  it('reports supported modes', () => {
    expect(registrySupportsMode(manifest, 'zero-knowledge')).toBe(true);
    expect(registrySupportsMode(manifest, 'trusted')).toBe(false);
  });
  it('reports directory availability', () => {
    expect(registryHasDirectory(manifest)).toBe(true);
    expect(registryHasDirectory({ ...manifest, directory: undefined })).toBe(false);
    expect(
      registryHasDirectory({ ...manifest, directory: { enabled: false, assurance: [] } }),
    ).toBe(false);
  });
});

describe('assurance', () => {
  it('only domain/sso skip the manual fingerprint dance', () => {
    expect(isVerifiedAssurance('self')).toBe(false);
    expect(isVerifiedAssurance('domain')).toBe(true);
    expect(isVerifiedAssurance('sso')).toBe(true);
  });
});

describe('OpenAPI <-> paths consistency', () => {
  it('every static REGISTRY_PATHS entry is documented in OpenAPI', () => {
    const documented = new Set(Object.keys(OPENAPI_DOCUMENT.paths));
    // Static (non-template) paths must each appear verbatim.
    const staticPaths = [
      REGISTRY_PATHS.manifest,
      REGISTRY_PATHS.blobs,
      REGISTRY_PATHS.inbox,
      REGISTRY_PATHS.sessions,
      REGISTRY_PATHS.directory,
    ];
    for (const p of staticPaths) expect(documented).toContain(p);
  });

  it('templated paths map to OpenAPI {param} form', () => {
    expect(REGISTRY_PATHS.blob('abc')).toBe('/blobs/abc');
    expect(Object.keys(OPENAPI_DOCUMENT.paths)).toContain('/blobs/{id}');
    expect(Object.keys(OPENAPI_DOCUMENT.paths)).toContain('/directory/{handle}');
  });

  it('error codes in OpenAPI match the ERROR_STATUS table', () => {
    const schemaCodes: string[] =
      OPENAPI_DOCUMENT.components.schemas.ErrorBody.properties.error.properties.code.enum;
    expect(new Set(schemaCodes)).toEqual(new Set(Object.keys(ERROR_STATUS)));
  });
});
