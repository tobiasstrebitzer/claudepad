import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { applyResolvedTheme } from './lib/theme';
import { App } from './App';

// Ensure <html data-theme> matches the persisted/system preference (the inline
// head script already does this pre-paint; this keeps it correct after hydration).
applyResolvedTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
