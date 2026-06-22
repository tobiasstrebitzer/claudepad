import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import { applyResolvedTheme } from './lib/theme'
import { applyViewerTheme } from './lib/viewer-theme'
import { App } from './App'

// Ensure <html data-theme>/<data-viewer-theme> match the persisted preferences
// (the inline head script already does this pre-paint; this keeps it correct
// after hydration). data-theme = functional light/dark, data-viewer-theme = palette.
applyResolvedTheme()
applyViewerTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
