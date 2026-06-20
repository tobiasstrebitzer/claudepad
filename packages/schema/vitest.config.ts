import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'schema',
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/parse.ts', 'src/order.ts', 'src/adapters/claude-code/**'],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
  },
});
