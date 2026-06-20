// tokenize.ts - tolerant NDJSON splitter (FR-1, FR-2).
//
// UTF-8 decode (strip BOM), split on `\n`, tolerate `\r\n`, blank lines,
// leading/trailing whitespace, and a truncated final line. Never throws.

export interface RawLine {
  /** 1-based source line number. */
  line: number;
  /** Trimmed line text (whitespace + trailing \r removed). */
  text: string;
}

/**
 * Decode an ArrayBuffer/Uint8Array to a string as UTF-8, stripping a leading
 * BOM if present. Falls back to a lossy decode rather than throwing.
 */
export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // TextDecoder is the only allowed global (FR-30). fatal:false → never throws.
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = decoder.decode(view);
  text = stripBom(text);
  return text;
}

/** Strip a leading UTF-8/UTF-16 BOM (U+FEFF) from a decoded string. */
export function stripBom(text: string): string {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Split a decoded JSONL string into non-empty trimmed lines, tracking the
 * original 1-based line number. Tolerates `\r\n`, blank lines, leading/trailing
 * whitespace, and a truncated final line (it is returned like any other line;
 * the JSON.parse step decides whether it is usable). Never throws.
 */
export function tokenizeLines(input: string): RawLine[] {
  const out: RawLine[] = [];
  // Split on \n; a trailing \r is stripped per line so \r\n is handled.
  const parts = input.split('\n');
  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i] ?? '';
    const trimmed = rawPart.replace(/\r$/, '').trim();
    if (trimmed.length === 0) continue;
    out.push({ line: i + 1, text: trimmed });
  }
  return out;
}
