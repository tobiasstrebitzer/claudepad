// content.ts — Claude Code content-block mappers (FR-11..FR-15, FR-22).
//
// Maps Anthropic message-content blocks to normalized ContentBlocks. Thinking
// and tool_use blocks are NOT ContentBlocks — they become their own events and
// are handled in events.ts; this module models text/image/raw.

import type { ContentBlock } from '../../types';
import { isObject } from '../../detect';

/** A raw Anthropic content block. */
export type RawBlock = Record<string, unknown>;

/** Normalize a bare-string message content to a single text ContentBlock (FR-12). */
export function stringToTextBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

/**
 * Map a single `text` block → ContentBlock{text}. Returns undefined if the
 * block isn't a usable text block (caller falls back to raw).
 */
export function mapTextBlock(block: RawBlock): ContentBlock | undefined {
  const text = block['text'];
  if (typeof text === 'string') return { type: 'text', text };
  return undefined;
}

/**
 * Map an `image` block, capturing its source by reference (FR-15). Image bytes
 * are preserved as the `ref` string; nothing is decoded/re-encoded.
 */
export function mapImageBlock(block: RawBlock): ContentBlock {
  const source = block['source'];
  if (isObject(source)) {
    const sType = source['type'];
    if (sType === 'base64') {
      const data = source['data'];
      const mediaType = source['media_type'];
      const out: ContentBlock = {
        type: 'image',
        ref: typeof data === 'string' ? data : '',
        encoding: 'base64',
      };
      if (typeof mediaType === 'string') out.mediaType = mediaType;
      return out;
    }
    if (sType === 'url') {
      const url = source['url'];
      return { type: 'image', ref: typeof url === 'string' ? url : '', encoding: 'url' };
    }
    if (sType === 'file') {
      const fileId = source['file_id'];
      return {
        type: 'image',
        ref: typeof fileId === 'string' ? fileId : '',
        encoding: 'file',
      };
    }
  }
  // Unknown image source shape: keep it preserved-but-renderable.
  return { type: 'raw', value: block };
}

/** Wrap an unrecognized block as a raw ContentBlock (FR-22). */
export function rawBlock(block: unknown): ContentBlock {
  return { type: 'raw', value: block };
}
