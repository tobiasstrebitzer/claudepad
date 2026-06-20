import type { ContentBlock } from '@claudepad/schema';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { ImageBlock } from './ImageBlock';
import { RawBlock } from './RawBlock';
import { BlockErrorBoundary } from '../BlockErrorBoundary';

/** Render an ordered list of content blocks, each error-isolated. */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
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
      // Exhaustiveness guard — unknown block shape degrades gracefully.
      return <RawBlock value={block} />;
  }
}
