import { defineConfig } from 'vitest/config';

// Root aggregator (Vitest 4): each package owns its vitest.config.ts; `pnpm test`
// at the root runs the whole suite (schema + shared + client) as projects.
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
