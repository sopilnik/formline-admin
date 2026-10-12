import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@seed': fileURLToPath(new URL('./db/seed', import.meta.url)),
      '@messages': fileURLToPath(new URL('./messages', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['*.test.ts', 'app/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'db/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
})
