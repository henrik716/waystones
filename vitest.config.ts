import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['utils/**/*.test.ts', 'server.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['utils/**/*.ts', 'server.js'],
      exclude: ['utils/**/*.test.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
