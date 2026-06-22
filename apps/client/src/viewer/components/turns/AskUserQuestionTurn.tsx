import type { ToolResultEvent, ToolUseEvent } from '@/schema'
import { CircleHelp } from 'lucide-react'
import * as React from 'react'
import { Badge } from '../../../components/ui/Badge'
import { cn } from '../../../lib/cn'
import { ToolResult } from './ToolResult'

export function isAskUserQuestion(name: string): boolean {
  return name === 'AskUserQuestion'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

interface ParsedQuestion {
  header?: string
  question: string
  options: Array<{ label: string; description?: string }>
  multiSelect: boolean
}

function parse(input: unknown): ParsedQuestion[] {
  const obj = isRecord(input) ? input : {}
  const questions = Array.isArray(obj['questions']) ? obj['questions'] : []
  return questions.filter(isRecord).map((q): ParsedQuestion => ({
    header: str(q['header']),
    question: str(q['question']) ?? '(question)',
    multiSelect: q['multiSelect'] === true,
    options: (Array.isArray(q['options']) ? q['options'] : []).filter(isRecord).map((o) => ({
      label: str(o['label']) ?? '(option)',
      description: str(o['description'])
    }))
  }))
}

/** Renders an AskUserQuestion tool call as a question + options card. */
export const AskUserQuestionTurn = React.memo(({
  event,
  result,
  anchorId,
  highlighted
}: {
  event: ToolUseEvent
  result?: ToolResultEvent
  anchorId: string
  highlighted?: boolean
}) => {
  const questions = React.useMemo(() => parse(event.input), [event.input])
  const showError = result?.isError === true

  return (
    <section
      id={anchorId}
      data-anchor-id={anchorId}
      role="article"
      aria-label="Question for the user"
      className={cn(
        'relative scroll-mt-24 space-y-3 rounded-lg border border-border bg-surface px-3 py-2.5',
        highlighted && 'ring-2 ring-accent transition-shadow duration-[var(--motion-slow)]'
      )}
    >
      <div className="flex items-center gap-2 text-label uppercase tracking-[0.02em] text-muted-foreground">
        <CircleHelp className="size-3.5 shrink-0 text-accent" />
        <span>Question</span>
      </div>
      {questions.map((q, i) => (
        <div key={i} className="space-y-1.5">
          {q.header && <span className="text-label text-muted-foreground">{q.header}</span>}
          <p className="text-body-sm font-medium text-text">{q.question}</p>
          <ul className="flex flex-wrap gap-1.5">
            {q.options.map((o, j) => (
              <li key={j}>
                <Badge variant="outline" className="bg-sidebar text-muted-foreground" title={o.description}>
                  {o.label}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {showError && result && <ToolResult event={result} />}
    </section>
  )
})
