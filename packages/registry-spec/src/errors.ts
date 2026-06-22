/**
 * Typed errors for the registry contract. Both the reference impl and the SDK
 * speak these codes, so the client can branch on a stable code rather than a
 * brittle status number or message string.
 */

export type RegistryErrorCode =
  | 'tls_required' // non-https registry URL refused client-side (D-77)
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict' // e.g. handle already claimed by another key
  | 'mode_unsupported' // e.g. trusted publish to a ZK-only registry
  | 'directory_disabled'
  | 'payload_too_large'
  | 'rate_limited'
  | 'gone' // burned-after-read or expired
  | 'server_error';

/** HTTP status a conformant registry returns for each code. */
export const ERROR_STATUS: Record<RegistryErrorCode, number> = {
  tls_required: 400,
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  mode_unsupported: 422,
  directory_disabled: 404,
  payload_too_large: 413,
  rate_limited: 429,
  gone: 410,
  server_error: 500,
};

export interface ErrorBody {
  error: { code: RegistryErrorCode; message: string };
}

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly status: number;

  constructor(code: RegistryErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RegistryError';
    this.code = code;
    this.status = ERROR_STATUS[code];
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/** Narrow an unknown JSON body to an ErrorBody. */
export function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}
