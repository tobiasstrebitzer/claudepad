import { splitSecretTokens } from '../../secret-token';

// A rehype transform that turns secret placeholder tokens embedded in markdown
// TEXT nodes into atomic `<cp-secret>` elements, which the Markdown renderer maps
// to a SecretChip. This is the correct integration point: react-markdown does NOT
// invoke a `components.text` handler for raw text nodes, so the chip must be
// injected at the hast level. It runs AFTER rehype-sanitize, so the injected
// elements are trusted and never re-sanitized; sanitize has already stripped any
// dangerous embedded HTML from the original content.
//
// Text inside `<code>`/`<pre>` is left untouched (inline code handles its own
// placeholders; fenced code is rendered verbatim by CodeBlock).

interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
type HastNode =
  | HastText
  | HastElement
  | { type: string; children?: HastNode[]; value?: string };

const isElement = (n: HastNode): n is HastElement => n.type === 'element';
const isText = (n: HastNode): n is HastText => n.type === 'text';

function splitTextNode(value: string): HastNode[] {
  const segments = splitSecretTokens(value);
  if (segments.length === 1 && segments[0]?.kind === 'text') {
    return [{ type: 'text', value }];
  }
  return segments.map((seg) =>
    seg.kind === 'text'
      ? ({ type: 'text', value: seg.text } satisfies HastText)
      : ({
          type: 'element',
          tagName: 'cp-secret',
          properties: {
            secretId: seg.placeholder.id,
            secretType: seg.placeholder.type,
            secretLen: String(seg.placeholder.len),
          },
          children: [],
        } satisfies HastElement),
  );
}

function transform(node: HastNode, inCode: boolean): void {
  const children = (node as { children?: HastNode[] }).children;
  if (!children) return;
  const out: HastNode[] = [];
  for (const child of children) {
    if (isText(child) && !inCode) {
      out.push(...splitTextNode(child.value));
    } else {
      if (isElement(child)) {
        transform(child, inCode || child.tagName === 'code' || child.tagName === 'pre');
      }
      out.push(child);
    }
  }
  (node as { children: HastNode[] }).children = out;
}

/** rehype plugin: inject `<cp-secret>` chip elements for placeholder tokens. */
export function rehypeSecrets() {
  return (tree: HastNode): void => transform(tree, false);
}
