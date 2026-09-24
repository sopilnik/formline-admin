import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Integration tests share one database per run, so files run one after another.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/int/**/*.test.ts'],
    globalSetup: ['tests/int/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
