import * as React from 'react'
import { RawBlock } from './blocks/RawBlock'

interface Props {
  /** Raw payload to offer as the "show raw" escape hatch when render fails. */
  fallbackValue?: unknown
  children: React.ReactNode
}

interface State {
  error: Error | null
}

/**
 * Wraps a single block/turn so one bad render can't crash the transcript
 * (FR-7). On error, degrades to a "show raw" fallback.
 */
export class BlockErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <RawBlock
          label="Couldn't render this block"
          value={this.props.fallbackValue ?? { error: String(this.state.error?.message) }}
        />
      )
    }
    return this.props.children
  }
}
