import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'registry-spec',
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
