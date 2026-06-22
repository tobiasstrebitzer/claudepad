import * as React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/cn'
import { CodeBlock } from './CodeBlock'
import { SecretChip, SecretText } from './SecretText'
import { rehypeSecrets } from './rehype-secrets'

/**
 * Sanitized GFM markdown. `rehype-sanitize` (strict default schema) strips any
 * raw/embedded HTML so session content can never execute script (FR-3, §8).
 * Custom renderers:
 *   - fenced code  → CodeBlock (highlight + copy)
 *   - placeholders → injected as <cp-secret> by `rehypeSecrets` (which runs AFTER
 *                    sanitize), rendered here as a SecretChip. react-markdown does
 *                    not call a `text` component, so chips MUST be injected at the
 *                    hast level rather than by overriding text nodes.
 */
const components = {
  'cp-secret': ({ node }: { node?: { properties?: Record<string, unknown> } }) => {
    const p = node?.properties ?? {}
    return (
      <SecretChip
        placeholder={{
          id: String(p.secretId ?? ''),
          type: String(p.secretType ?? 'SECRET'),
          len: Number(p.secretLen ?? 0)
        }}
      />
    )
  },
  code({ className, children, node, ...props }) {
    const text = String(children ?? '').replace(/\n$/, '')
    const isBlock =
      // remark sets `data.meta`/position; a fenced block lives inside a <pre>.
      (node as { position?: { start: { line: number }; end: { line: number } } })
        ?.position != null && text.includes('\n')
        ? true
        : (className ?? '').includes('language-')
    if (isBlock || (className ?? '').includes('language-')) {
      const match = /language-(\w[\w+-]*)/.exec(className ?? '')
      return <CodeBlock code={text} lang={match?.[1]} />
    }
    // Inline code - still run through SecretText for embedded placeholders.
    return (
      <code
        className={cn(
          'rounded-sm bg-sidebar px-1 py-0.5 font-mono text-[0.9em]',
          className
        )}
        {...props}
      >
        <SecretText>{text}</SecretText>
      </code>
    )
  },
  // A fenced block is rendered by `code` above; keep <pre> as a passthrough so
  // we don't double-wrap.
  pre: ({ children }) => <>{children}</>,
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-accent underline-offset-4 hover:underline"
      {...props}
    >
      {children}
    </a>
  )
} satisfies Components & Record<'cp-secret', unknown>

export const Markdown = React.memo(({ text }: { text: string }) => {
  return (
    <div className={proseClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehypeSecrets runs AFTER sanitize so the chip elements it injects are trusted.
        rehypePlugins={[rehypeSanitize, rehypeSecrets]}
        components={components as Components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

// Warm-minimal prose. Token utilities only (no raw hex).
const proseClass = cn(
  'text-body text-text',
  '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-serif [&_h1]:text-heading-1',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-heading-2',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-medium [&_h3]:text-heading-3',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-body-sm',
  '[&_th]:border [&_th]:border-border [&_th]:bg-sidebar [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_input[type=checkbox]]:mr-1.5'
)
