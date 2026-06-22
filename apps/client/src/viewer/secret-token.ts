// Provisional secret placeholder token - the rendering contract with PRD-06.
//
// PRD-06 (secret detection) is NOT built yet. PRD-03 only RENDERS placeholders,
// so we define a stable, self-describing token here and document it as the
// contract. When PRD-06 lands it MUST emit this exact serialized form (or this
// module is updated deliberately and noted in DECISIONS.md).
//
// Token text form (lives inside a `text` content block, post-markdown text node):
//
//     ⟦cp-secret:<id>:<TYPE>:<len>⟧
//
// e.g.  ⟦cp-secret:s1:AWS_KEY:20⟧
//
// The token carries everything the chip needs to render WITHOUT a secret map:
//   - id   : opaque key into `secretMap` (reveal = secretMap[id]?.value)
//   - type : human label shown on the chip (e.g. AWS_KEY)
//   - len  : real length of the original value, shown as `(len)`
//
// Security: the token NEVER contains any substring/prefix/hash of the real
// value - only its length. The dot count on the chip is cosmetic & fixed (8).

/** A parsed placeholder. `len` is the real length of the redacted value. */
export interface SecretPlaceholder {
  /** Opaque id; key into the secret map. */
  id: string
  /** Type label, e.g. "AWS_KEY". */
  type: string
  /** Real length of the original value. */
  len: number
}

/** Delimiters chosen to be vanishingly unlikely in real session text. */
const OPEN = '⟦' // ⟦
const CLOSE = '⟧' // ⟧

// id: word-ish, TYPE: upper/word-ish, len: digits. Tolerant but bounded.
const TOKEN_BODY = 'cp-secret:([A-Za-z0-9_-]+):([A-Za-z0-9_]+):(\\d+)'

/** Global matcher used to split a text node into [text, placeholder, …] parts. */
export function secretTokenRegex(): RegExp {
  return new RegExp(`${OPEN}${TOKEN_BODY}${CLOSE}`, 'g')
}

/** Build a token string (used by the demo fixture / future PRD-06). */
export function makeSecretToken(p: SecretPlaceholder): string {
  return `${OPEN}cp-secret:${p.id}:${p.type}:${p.len}${CLOSE}`
}

/** True if the string contains at least one placeholder token. */
export function hasSecretToken(text: string): boolean {
  return secretTokenRegex().test(text)
}

/**
 * A segment of a text node: either literal text or a parsed placeholder.
 * Splitting at the text-node level (after markdown parse) means a placeholder
 * always renders as one atomic chip and a revealed value can never be
 * re-interpreted as markdown/HTML.
 */
export type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'secret'; placeholder: SecretPlaceholder }

/** Split a raw text string into ordered text / placeholder segments. */
export function splitSecretTokens(input: string): TextSegment[] {
  const re = secretTokenRegex()
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(input)) !== null) {
    const [full, id, type, lenRaw] = match
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: input.slice(lastIndex, match.index) })
    }
    segments.push({
      kind: 'secret',
      placeholder: { id: id ?? '', type: type ?? 'SECRET', len: Number(lenRaw ?? 0) }
    })
    lastIndex = match.index + full.length
  }
  if (lastIndex < input.length) {
    segments.push({ kind: 'text', text: input.slice(lastIndex) })
  }
  return segments
}
