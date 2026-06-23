/**
 * Authentication is operator-defined by the contract; mutating/inbox routes
 * only have to be authenticated somehow. The reference impl ships a minimal,
 * honestly-labeled dev scheme: `Authorization: Bearer <identity-id>`, where the
 * id is the caller's opaque identity key (e.g. its pub hash). Real deployments
 * swap in a signed-challenge / SSO authenticator.
 */

export interface AuthContext {
  /** Opaque identity id. Doubles as the inbox key for `indexFor` matching. */
  id: string
}

export type Authenticator = (request: Request) => Promise<AuthContext | null>

/** Reference-grade bearer auth. NOT for production - any value is accepted as an id. */
export const devBearerAuth: Authenticator = async (request) => {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const id = match?.[1]?.trim()
  return id ? { id } : null
}
