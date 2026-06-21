import * as React from 'react';
import { ListChecks, Circle, CircleDot, CircleCheck } from 'lucide-react';
import type { ToolUseEvent, ToolResultEvent } from '@claudepad/schema';
import { cn } from '../../../lib/cn';
import { ToolResult } from './ToolResult';

/** Tool calls that manage the task / todo list. */
export function isTaskTool(name: string): boolean {
  return name === 'TodoWrite' || name === 'TaskCreate' || name === 'TaskUpdate';
}

type TaskStatus = 'pending' | 'in_progress' | 'completed' | undefined;

interface TaskItem {
  label: string;
  status: TaskStatus;
  detail?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStatus(v: unknown): TaskStatus {
  return v === 'pending' || v === 'in_progress' || v === 'completed' ? v : undefined;
}

function parse(name: string, input: unknown): { title: string; items: TaskItem[] } {
  const obj = isRecord(input) ? input : {};

  // TodoWrite: a full list snapshot.
  if (Array.isArray(obj['todos'])) {
    const items = obj['todos'].filter(isRecord).map((t): TaskItem => ({
      label: str(t['content']) ?? str(t['activeForm']) ?? '(task)',
      status: asStatus(t['status']),
    }));
    return { title: 'Todos', items };
  }

  // TaskCreate / TaskUpdate: a single task.
  const item: TaskItem = {
    label: str(obj['subject']) ?? str(obj['activeForm']) ?? str(obj['description']) ?? '(task)',
    status: asStatus(obj['status']),
    detail: str(obj['description']),
  };
  return { title: name === 'TaskCreate' ? 'Task created' : 'Task updated', items: [item] };
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'completed')
    return <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />;
  if (status === 'in_progress')
    return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent" />;
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted" />;
}

/** Renders TodoWrite / TaskCreate / TaskUpdate as a checklist card. */
export const TaskListTurn = React.memo(function TaskListTurn({
  event,
  result,
  anchorId,
  highlighted,
}: {
  event: ToolUseEvent;
  result?: ToolResultEvent;
  anchorId: string;
  highlighted?: boolean;
}) {
  const { title, items } = React.useMemo(
    () => parse(event.name, event.input),
    [event.name, event.input],
  );
  const showError = result?.isError === true;

  return (
    <section
      id={anchorId}
      data-anchor-id={anchorId}
      role="article"
      aria-label={`Task list (${event.name})`}
      className={cn(
        'relative scroll-mt-24 rounded-lg border border-border bg-surface px-3 py-2.5',
        highlighted && 'ring-2 ring-accent transition-shadow duration-[var(--motion-slow)]',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-label uppercase tracking-[0.02em] text-muted">
        <ListChecks className="size-3.5 shrink-0 text-accent" />
        <span>{title}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-body-sm">
            <StatusIcon status={item.status} />
            <div className="min-w-0">
              <span
                className={cn(
                  'break-words',
                  item.status === 'completed' ? 'text-muted line-through' : 'text-text',
                )}
              >
                {item.label}
              </span>
              {item.detail && item.detail !== item.label && (
                <p className="mt-0.5 break-words text-body-sm text-muted">{item.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {showError && result && <ToolResult event={result} />}
    </section>
  );
});
