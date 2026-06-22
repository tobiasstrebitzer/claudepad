import { Upload } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/cn'

interface DropZoneProps {
  onFile: (file: File) => void
  /** Non-blocking note shown when more than one file is dropped (FR-4). */
  onMultiple?: (count: number) => void
  children?: React.ReactNode
}

// Drag-and-drop + file-picker target (PRD-04 FR-1/FR-2/FR-4). The shape detector,
// not the extension, decides validity - so the picker filter is a hint, not a gate.
export function DropZone({ onFile, onMultiple, children }: DropZoneProps) {
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const depth = React.useRef(0)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    if (files.length > 1) onMultiple?.(files.length)
    const first = files[0]
    if (first) onFile(first)
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border border-dashed border-border bg-surface p-8 text-center transition-colors',
        dragging && 'border-accent bg-accent-tint'
      )}
      data-dragging={dragging || undefined}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-tint text-accent">
        <Upload className="size-5" />
      </div>
      <p className="mt-4 text-body text-text">
        Drag a <code className="font-mono text-code">.jsonl</code> session or{' '}
        <code className="font-mono text-code">.cpad</code> share here
      </p>
      <p className="mt-1 text-body-sm text-muted-foreground">or paste a transcript (⌘V / Ctrl-V)</p>
      <div className="mt-5">
        <Button variant="default" onClick={() => inputRef.current?.click()}>
          <Upload />
          Choose file…
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jsonl,.json,.txt,.ndjson,.cpad,application/json,text/plain"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 1) onMultiple?.(files.length)
          const first = files[0]
          if (first) onFile(first)
          e.target.value = '' // allow re-picking the same file
        }}
      />
      {children}
    </div>
  )
}
