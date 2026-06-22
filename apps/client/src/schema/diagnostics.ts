// diagnostics.ts - DiagnosticRecord builders + ParseStats accumulator.

import type { DiagnosticKind, DiagnosticRecord, ParseStats } from './types'

const MAX_SNIPPET = 120

/** Truncate a snippet to a bounded, content-light length (FR-3, §8). */
export function snippet(text: string): string {
  if (text.length <= MAX_SNIPPET) return text
  return text.slice(0, MAX_SNIPPET) + '…'
}

export interface DiagOptions {
  level?: 'info' | 'warn'
  line?: number
  snippet?: string
}

export function diag(
  kind: DiagnosticKind,
  message: string,
  opts: DiagOptions = {}
): DiagnosticRecord {
  const rec: DiagnosticRecord = {
    kind,
    level: opts.level ?? defaultLevel(kind),
    message
  }
  if (opts.line !== undefined) rec.line = opts.line
  if (opts.snippet !== undefined) rec.snippet = opts.snippet
  return rec
}

function defaultLevel(kind: DiagnosticKind): 'info' | 'warn' {
  switch (kind) {
    case 'newer-format':
    case 'low-confidence-input':
    case 'empty-input':
      return 'info'
    default:
      return 'warn'
  }
}

/** Mutable accumulator for ParseStats, finalized at the end of parsing. */
export class StatsAccumulator {
  inputForm: ParseStats['inputForm'] = 'unknown'
  totalLines = 0
  parsedRecords = 0
  events = 0
  unknownEventTypes: Record<string, number> = {}
  unknownBlockTypes: Record<string, number> = {}
  detectedVersion = 'unknown'
  mappedRecords = 0
  droppedToDiagnostics = 0

  noteUnknownEvent(type: string): void {
    this.unknownEventTypes[type] = (this.unknownEventTypes[type] ?? 0) + 1
  }

  noteUnknownBlock(type: string): void {
    this.unknownBlockTypes[type] = (this.unknownBlockTypes[type] ?? 0) + 1
  }

  finalize(): ParseStats {
    return {
      inputForm: this.inputForm,
      totalLines: this.totalLines,
      parsedRecords: this.parsedRecords,
      events: this.events,
      unknownEventTypes: this.unknownEventTypes,
      unknownBlockTypes: this.unknownBlockTypes,
      detectedVersion: this.detectedVersion,
      mappedRecords: this.mappedRecords,
      droppedToDiagnostics: this.droppedToDiagnostics
    }
  }
}
