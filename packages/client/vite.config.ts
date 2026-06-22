import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Single static bundle (PRD-01 §6.1, Q-1): no third-party runtime fetches -
// fonts are self-hosted via @fontsource, icons tree-shaken from lucide.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `@/*` -> src (mirrors tsconfig paths; the shadcn-generated ui/ primitives
  // import via this alias). Vite does not read tsconfig paths on its own.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
