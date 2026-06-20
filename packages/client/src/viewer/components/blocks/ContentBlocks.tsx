import type { ContentBlock } from '@claudepad/schema';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { ImageBlock } from './ImageBlock';
import { RawBlock } from './RawBlock';
import { BlockErrorBoundary } from '../BlockErrorBoundary';

/**
 * Render an ordered list of content blocks, each error-isolated.
 *
 * `typingFraction` (PRD-08 FR-17): when set in `[0,1)`, the active playback turn
 * reveals its prose progressively - plain text/thinking type out, while code,
 * tool I/O, and images appear atomically once typing reaches them. At `>= 1`
 * (or undefined) the turn renders fully (markdown). Reduced-motion never types.
 */
export function ContentBlocks({
  blocks,
  typingFraction,
}: {
  blocks: ContentBlock[];
  typingFraction?: number;
}) {
  if (typingFraction != null && typingFraction < 1) {
    return <TypingBlocks blocks={blocks} fraction={typingFraction} />;
  }
  return (
    <>
      {blocks.map((block, i) => (
        <BlockErrorBoundary key={i} fallbackValue={block}>
          <SingleBlock block={block} />
        </BlockErrorBoundary>
      ))}
    </>
  );
}

const SECRET_TOKEN = /⟦cp-secret:[^⟧]*⟧/g;

/** Light inline-markdown strip so typed prose reads cleanly (no raw `**`/`#`). */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(SECRET_TOKEN, '••••')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ');
}

const typeable = (b: ContentBlock): b is { type: 'text'; text: string } => b.type === 'text';

/**
 * Progressive prose reveal. Distributes `floor(fraction × total)` characters
 * across the (stripped) text blocks in order; non-text blocks reveal once typing
 * has passed them. Falls back to atomic render when there's no typeable prose.
 */
function TypingBlocks({ blocks, fraction }: { blocks: ContentBlock[]; fraction: number }) {
  const stripped = blocks.map((b) => (typeable(b) ? stripInlineMarkdown(b.text) : ''));
  const total = stripped.reduce((n, s) => n + s.length, 0);
  if (total === 0) {
    // Nothing to type (e.g. a code-only turn) - show it atomically.
    return (
      <>
        {blocks.map((block, i) => (
          <BlockErrorBoundary key={i} fallbackValue={block}>
            <SingleBlock block={block} />
          </BlockErrorBoundary>
        ))}
      </>
    );
  }

  let budget = Math.floor(fraction * total);
  let caretPlaced = false;
  return (
    <>
      {blocks.map((block, i) => {
        if (typeable(block)) {
          const s = stripped[i]!;
          const shown = s.slice(0, Math.min(s.length, Math.max(0, budget)));
          const partial = budget < s.length;
          budget = Math.max(0, budget - s.length);
          if (!shown && !(partial && !caretPlaced)) return null;
          const caret = partial && !caretPlaced;
          if (caret) caretPlaced = true;
          return (
            <p key={i} className="whitespace-pre-wrap leading-relaxed text-text">
              {shown}
              {caret && (
                <span aria-hidden className="ml-px animate-pulse text-accent">
                  ▍
                </span>
              )}
            </p>
          );
        }
        // Non-text block: appears atomically once typing has reached it.
        if (budget <= 0) return null;
        return (
          <BlockErrorBoundary key={i} fallbackValue={block}>
            <SingleBlock block={block} />
          </BlockErrorBoundary>
        );
      })}
    </>
  );
}

function SingleBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <Markdown text={block.text} />;
    case 'code':
      return <CodeBlock code={block.text} lang={block.lang} />;
    case 'image':
      return (
        <ImageBlock
          ref_={block.ref}
          mediaType={block.mediaType}
          encoding={block.encoding}
        />
      );
    case 'raw':
      return <RawBlock value={block.value} />;
    default:
      // Exhaustiveness guard - unknown block shape degrades gracefully.
      return <RawBlock value={block} />;
  }
}
