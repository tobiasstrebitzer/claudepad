import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { highlightToHtml, resolveLang } from '../../highlighter';
import { hasSecretToken } from '../../secret-token';
import { SecretText } from './SecretText';

interface CodeBlockProps {
  /** Exact original source - what the copy button writes. */
  code: string;
  lang?: string;
  className?: string;
}

/**
 * Syntax-highlighted code block with a copy button.
 *
 * Renders PLAIN mono synchronously first (so it never blocks first paint and
 * tests don't depend on async highlight), then upgrades to Shiki HTML when the
 * block is on/near screen. Copy always writes the EXACT original `code`, never
 * the highlighted markup (FR-5).
 */
export const CodeBlock = React.memo(function CodeBlock({
  code,
  lang,
  className,
}: CodeBlockProps) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const label = lang && resolveLang(lang) ? lang : lang ? lang : 'text';
  // Redacted code carries placeholder tokens; skip Shiki (it would render the
  // sentinel as plain text) and split into secret chips instead.
  const redacted = React.useMemo(() => hasSecretToken(code), [code]);

  // Highlight only once the block is near the viewport (lazy, on-visible).
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    if (!visible || redacted) return;
    let cancelled = false;
    highlightToHtml(code, lang).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, code, lang, redacted]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative my-3 overflow-hidden rounded-md border border-border bg-sidebar',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-label uppercase tracking-[0.02em] text-muted">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <div className="overflow-x-auto">
        {html && !redacted ? (
          <div
            className="cp-shiki text-code [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:px-3 [&_pre]:py-2.5"
            // Shiki output is generated locally from our bundled grammars/theme;
            // it contains only <pre><code><span> with inline color styles.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="m-0 px-3 py-2.5 font-mono text-code text-text">
            <code>{redacted ? <SecretText>{code}</SecretText> : code}</code>
          </pre>
        )}
      </div>
    </div>
  );
});

export function CopyButton({
  text,
  className,
  label = 'Copy code',
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Best-effort; clipboard may be unavailable (e.g. jsdom).
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label text-muted',
        'transition-colors duration-[120ms] ease-[var(--ease-standard)] hover:text-accent',
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-success" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
