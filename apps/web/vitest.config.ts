import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/// Unit/component-тесты frontend (ADR-0011: Vitest + Testing Library).
/// E2E (Playwright) — PHASE 33.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    // Длинные сценарии форм (userEvent) под параллельной нагрузкой выходили за
    // 5 с по умолчанию — ложные падения; сами тесты идут 1–2 с.
    testTimeout: 15_000,
  },
});
