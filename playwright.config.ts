import { defineConfig } from '@playwright/test'
import { E2E_AUTH_ENV, E2E_CLIENT_IP, E2E_ORIGIN_SECRET, E2E_PORT } from './tests/e2e/constants'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
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
      DATABASE_URL: 'postgres://app:app-local-password@127.0.0.1:56432/formline_dev',
      ...E2E_AUTH_ENV,
    },
  },
})
