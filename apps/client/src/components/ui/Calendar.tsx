import 'react-day-picker/style.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '../../lib/utils'

// react-day-picker themed onto our design tokens: the library exposes its colors
// as `--rdp-*` custom properties, so we remap those to our tokens rather than
// fighting its class names (no raw hex; tracks light/dark + viewer themes).
const RDP_THEME = {
  '--rdp-accent-color': 'var(--accent)',
  '--rdp-accent-background-color': 'var(--accent-tint)',
  '--rdp-today-color': 'var(--accent)',
  '--rdp-range_start-background': 'var(--accent)',
  '--rdp-range_start-color': 'var(--accent-fg)',
  '--rdp-range_start-date-background-color': 'var(--accent)',
  '--rdp-range_end-background': 'var(--accent)',
  '--rdp-range_end-color': 'var(--accent-fg)',
  '--rdp-range_end-date-background-color': 'var(--accent)',
  '--rdp-range_middle-background-color': 'var(--accent-tint)',
  '--rdp-range_middle-color': 'var(--text)',
  '--rdp-selected-border': '2px solid var(--accent)'
} as React.CSSProperties

export const Calendar: FunctionComponent<DayPickerProps> = ({ className, ...props }) => (
  <DayPicker
    showOutsideDays
    style={RDP_THEME}
    className={cn('text-sm text-text [--rdp-day-width:2rem] [--rdp-day-height:2rem]', className)}
    components={{
      Chevron: ({ orientation }) =>
        orientation === 'left' ? (
          <ChevronLeft className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )
    }}
    {...props}
  />
)
