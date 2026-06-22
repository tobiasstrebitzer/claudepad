// Typed crypto errors (PRD-05 FR-26). All extend Error and set a stable `.name`
// so callers can branch on error kind without leaking raw WebCrypto exceptions.

/** Input was structurally invalid: bad encoding, wrong length, malformed shape. */
export class CryptoFormatError extends Error {
  override readonly name = 'CryptoFormatError';
  constructor(message: string) {
    super(message);
  }
}

/** Authentication failed: wrong key, tampered ciphertext, or blob not addressed to us. */
export class CryptoAuthError extends Error {
  override readonly name = 'CryptoAuthError';
  constructor(message: string) {
    super(message);
  }
}

/** Unsupported or mismatched version / algorithm identifier. */
export class CryptoVersionError extends Error {
  override readonly name = 'CryptoVersionError';
  constructor(message: string) {
    super(message);
  }
}
