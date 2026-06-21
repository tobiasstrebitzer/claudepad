import * as React from 'react';
import type { RenderRow } from '../../hooks/useCorrelateTools';
import { UserTurn } from './UserTurn';
import { AssistantTurn } from './AssistantTurn';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCall } from './ToolCall';
import { ToolResult } from './ToolResult';
import { MetaBlock } from './MetaBlock';
import { SlashCommandTurn } from './SlashCommandTurn';
import { TaskListTurn, isTaskTool } from './TaskListTurn';
import { CommandOutputTurn } from './CommandOutputTurn';
import { AskUserQuestionTurn, isAskUserQuestion } from './AskUserQuestionTurn';
import { isSlashCommandEvent, isLocalCommandEvent } from '../../hooks/eventFilter';

/** Per-render context passed to every matched turn component. */
export interface TurnContext {
  anchorId: string;
  highlighted: boolean;
  /** PRD-08 typing reveal - only set for the active playback turn. */
  typingFraction?: number;
}

/**
 * A matcher maps a predicate over a render row to the component that renders it.
 * The first matcher whose `match` returns true wins, so order = priority
 * (specific before generic). Adding a new turn type = add an entry here; the
 * generic user/assistant/tool/meta entries stay as fallbacks.
 */
export interface TurnMatcher {
  id: string;
  match: (row: RenderRow) => boolean;
  render: (row: RenderRow, ctx: TurnContext) => React.ReactNode;
}

export const TURN_MATCHERS: TurnMatcher[] = [
  {
    id: 'slash-command',
    match: (row) =>
      row.kind === 'event' && row.event.kind === 'user' && isSlashCommandEvent(row.event),
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'user' ? (
        <SlashCommandTurn event={row.event} anchorId={ctx.anchorId} highlighted={ctx.highlighted} />
      ) : null,
  },
  {
    id: 'task-list',
    match: (row) => row.kind === 'tool' && isTaskTool(row.event.name),
    render: (row, ctx) =>
      row.kind === 'tool' ? (
        <TaskListTurn
          event={row.event}
          result={row.result}
          anchorId={ctx.anchorId}
          highlighted={ctx.highlighted}
        />
      ) : null,
  },
  {
    id: 'ask-user-question',
    match: (row) => row.kind === 'tool' && isAskUserQuestion(row.event.name),
    render: (row, ctx) =>
      row.kind === 'tool' ? (
        <AskUserQuestionTurn
          event={row.event}
          result={row.result}
          anchorId={ctx.anchorId}
          highlighted={ctx.highlighted}
        />
      ) : null,
  },
  {
    id: 'tool',
    match: (row) => row.kind === 'tool',
    render: (row, ctx) =>
      row.kind === 'tool' ? (
        <ToolCall
          event={row.event}
          result={row.result}
          anchorId={ctx.anchorId}
          highlighted={ctx.highlighted}
        />
      ) : null,
  },
  {
    id: 'orphan-result',
    match: (row) => row.kind === 'orphan-result',
    render: (row, ctx) =>
      row.kind === 'orphan-result' ? (
        <ToolResult event={row.event} standalone anchorId={ctx.anchorId} />
      ) : null,
  },
  {
    id: 'local-command',
    match: (row) =>
      row.kind === 'event' && row.event.kind === 'meta' && isLocalCommandEvent(row.event),
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'meta' ? (
        <CommandOutputTurn event={row.event} anchorId={ctx.anchorId} highlighted={ctx.highlighted} />
      ) : null,
  },
  {
    id: 'user',
    match: (row) => row.kind === 'event' && row.event.kind === 'user',
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'user' ? (
        <UserTurn
          event={row.event}
          anchorId={ctx.anchorId}
          highlighted={ctx.highlighted}
          typingFraction={ctx.typingFraction}
        />
      ) : null,
  },
  {
    id: 'assistant',
    match: (row) => row.kind === 'event' && row.event.kind === 'assistant',
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'assistant' ? (
        <AssistantTurn
          event={row.event}
          anchorId={ctx.anchorId}
          highlighted={ctx.highlighted}
          typingFraction={ctx.typingFraction}
        />
      ) : null,
  },
  {
    id: 'thinking',
    match: (row) => row.kind === 'event' && row.event.kind === 'thinking',
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'thinking' ? (
        <ThinkingBlock event={row.event} anchorId={ctx.anchorId} />
      ) : null,
  },
  {
    id: 'meta',
    match: (row) => row.kind === 'event' && row.event.kind === 'meta',
    render: (row, ctx) =>
      row.kind === 'event' && row.event.kind === 'meta' ? (
        <MetaBlock event={row.event} anchorId={ctx.anchorId} />
      ) : null,
  },
];

const FALLBACK: TurnMatcher = { id: 'fallback', match: () => true, render: () => null };

/** Find the first matching turn renderer for a row (always returns one). */
export function matchTurn(row: RenderRow): TurnMatcher {
  return TURN_MATCHERS.find((m) => m.match(row)) ?? FALLBACK;
}
