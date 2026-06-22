import {
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/DropdownMenu'
import { useExpandSignal } from '../hooks/useExpand'
import { useReveal } from '../hooks/useReveal'

// Session view controls, hosted in the unified top bar (D-49). Each reads its own
// viewer context and self-hides when not applicable, so the bar can render them
// unconditionally for a loaded session.

/** Reveal/hide all redacted secrets - only shown when a secret map is present. */
export function SecretsControl() {
  const reveal = useReveal()
  if (!reveal.hasMap) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" size="sm">
            <Eye className="size-4" />
            Secrets
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuLabel>Revealed values</DropdownMenuLabel>
        <DropdownMenuItem onClick={reveal.revealAll}>
          <Eye className="size-4" />
          Reveal all
        </DropdownMenuItem>
        <DropdownMenuItem onClick={reveal.hideAll}>
          <EyeOff className="size-4" />
          Hide all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Bulk expand/collapse of thinking + tool I/O blocks. */
export function ExpandControl() {
  const expand = useExpandSignal()
  if (!expand) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Expand or collapse blocks">
            <ChevronsUpDown className="size-4" />
            Expand
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => expand.expandAll('all')}>
          <ChevronsUpDown className="size-4" />
          Expand all
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => expand.collapseAll('all')}>
          <ChevronsDownUp className="size-4" />
          Collapse all
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Thinking</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => expand.expandAll('thinking')}>Expand</DropdownMenuItem>
        <DropdownMenuItem onClick={() => expand.collapseAll('thinking')}>Collapse</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tool I/O</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => expand.expandAll('toolIO')}>Expand</DropdownMenuItem>
        <DropdownMenuItem onClick={() => expand.collapseAll('toolIO')}>Collapse</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
