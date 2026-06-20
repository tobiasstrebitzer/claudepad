import { cn } from '../../lib/cn';

/**
 * claudepad mark (PRD-01 FR-17/FR-18, Q-A leaning): a notepad/page glyph whose
 * top transcript line is tipped by a single clay spark — "a place where sessions
 * become clean pages." Single-color, currentColor-driven SVG; the spark uses the
 * accent only in the `spark` variant. NOT Anthropic's asterisk/logo/typefaces.
 */

type MarkProps = {
  size?: number;
  /** `spark` paints the corner dot with the accent; otherwise it inherits currentColor. */
  variant?: 'mono' | 'spark';
  className?: string;
  title?: string;
};

export function Mark({
  size = 24,
  variant = 'mono',
  className,
  title = 'claudepad',
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      {/* page */}
      <rect
        x="4.5"
        y="3"
        width="13"
        height="18"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* transcript lines */}
      <line
        x1="8"
        y1="9"
        x2="12.5"
        y2="9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12.5"
        x2="14"
        y2="12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="16"
        x2="11"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* the spark — tip of the top line */}
      <circle
        cx="16.5"
        cy="9"
        r="2.1"
        fill={variant === 'spark' ? 'var(--accent)' : 'currentColor'}
      />
    </svg>
  );
}

/**
 * Candidate B (Q-A alternative): three descending transcript lines, the top one
 * tipped by an accent dot — "a session resolving into clean lines." Shown in the
 * gallery alongside the page-glyph mark so a final direction can be picked (PRD-09).
 */
export function MarkLines({
  size = 24,
  variant = 'mono',
  className,
  title = 'claudepad',
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <line
        x1="5"
        y1="7"
        x2="15"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="17"
        x2="12"
        y2="17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="18"
        cy="7"
        r="2.3"
        fill={variant === 'spark' ? 'var(--accent)' : 'currentColor'}
      />
    </svg>
  );
}

type WordmarkProps = {
  /** `full` = mark + wordmark; `small` = compact mark + wordmark; `mark` = glyph only. */
  size?: 'full' | 'small' | 'mark';
  variant?: 'mono' | 'spark';
  className?: string;
};

export function Wordmark({ size = 'full', variant = 'spark', className }: WordmarkProps) {
  if (size === 'mark') return <Mark variant={variant} className={className} />;
  const markSize = size === 'small' ? 20 : 24;
  return (
    <span className={cn('inline-flex items-center gap-2 text-text', className)}>
      <Mark size={markSize} variant={variant} />
      <span
        className={cn(
          'font-sans font-semibold tracking-tight lowercase',
          size === 'small' ? 'text-body' : 'text-heading-3',
        )}
      >
        claudepad
      </span>
    </span>
  );
}
