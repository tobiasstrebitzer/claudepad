// Public API for the zero-dependency WebCrypto core (PRD-05 v1 path).

export { bytesToB64url, b64urlToBytes, utf8ToBytes, bytesToUtf8 } from './base64url'

export { CryptoFormatError, CryptoAuthError, CryptoVersionError } from './errors'

export {
  ECDH,
  randomBytes,
  aesEncrypt,
  aesDecrypt,
  generateContentKey,
  importContentKey,
  deriveWrappingKey,
  deriveDeviceKEK,
  type AesLayer
} from './primitives'

export {
  type Identity,
  type PublicCard,
  mintIdentity,
  toPublicCard,
  encodePublicCard,
  decodePublicCard,
  encodeIdentitySecret,
  decodeIdentitySecret,
  importPrivateKey,
  importPublicKey
} from './identity'

export { fingerprint } from './fingerprint'

export {
  type Tier,
  type ShareBlob,
  type MultiShareBlob,
  type WrapEntry,
  type RecipientRef,
  type CreateBlobOpts,
  type CreateMultiBlobOpts,
  type OpenBlobResult,
  createBlob,
  createMultiBlob,
  openBlob,
  encodeBlob,
  decodeBlob,
  isMultiBlob
} from './blob'

export { wrapIdentity, unwrapIdentity } from './device'
