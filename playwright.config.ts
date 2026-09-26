import { defineConfig } from '@playwright/test'
import { E2E_APP_URL, E2E_AUTH_ENV, E2E_BASE_URL, E2E_CLIENT_IP, E2E_ORIGIN_SECRET, E2E_PORT } from './tests/e2e/constants'

// `pnpm test:e2e` builds and recreates the formline_e2e database first (package.json
// pretest:e2e). One worker: the owner tests share that database and run in order.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': E2E_CLIENT_IP },
  },
  webServer: {
    command: 'node scripts/serve-standalone.mjs',
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(E2E_PORT),
      HOSTNAME: '127.0.0.1',
      ORIGIN_AUTH_SECRET: E2E_ORIGIN_SECRET,
      DATABASE_URL: E2E_APP_URL,
      ...E2E_AUTH_ENV,
    },
  },
})
