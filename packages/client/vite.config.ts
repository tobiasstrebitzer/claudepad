import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Single static bundle (PRD-01 §6.1, Q-1): no third-party runtime fetches —
// fonts are self-hosted via @fontsource, icons tree-shaken from lucide.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
