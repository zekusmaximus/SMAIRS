import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Inline sql.js so its ESM build & wasm loader resolve under Vitest.
    // (Prevents Failed to resolve import "sql.js" errors in persistence tests.)
    server: {
      deps: {
        inline: ['sql.js']
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    globals: true,
  include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.spec.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@tauri-apps/api': path.resolve(__dirname, 'tests', '__mocks__', 'tauri-api.ts'),
      '@tauri-apps/api/core': path.resolve(__dirname, 'tests', '__mocks__', 'tauri-api.ts'),
    },
  },
});
