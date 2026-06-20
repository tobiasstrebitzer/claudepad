import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'secrets',
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
