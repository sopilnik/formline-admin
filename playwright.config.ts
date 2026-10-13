import { defineConfig } from '@playwright/test'
import { E2E_AUTH_ENV, E2E_BASE_URL, E2E_CLIENT_IP, E2E_ORIGIN_SECRET, E2E_STRIPE_ENV, E2E_STRIPE_PORT, E2E_WORKERS, e2eWorker } from './tests/e2e/constants'

const workers = Array.from({ length: E2E_WORKERS }, (_, index) => e2eWorker(index))

// `pnpm test:e2e` builds and recreates the end-to-end databases first (package.json pretest:e2e). Every worker has its
// own server and database (tests/e2e/constants.ts); the tests of one file run in order on one worker.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: E2E_WORKERS,
  retries: 0,
  forbidOnly: !!process.env.CI,
  // CI keeps the HTML report, the traces and the screenshots of a failed run as the e2e-evidence artifact (ci.yml).
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': E2E_CLIENT_IP },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Dispatched first, so it starts on a database nobody has touched: it creates the one owner through /setup, and its
    // authenticator waits make it the longest file of the run.
    { name: 'owner', testMatch: 'owner.spec.ts' },
    { name: 'panel', testIgnore: 'owner.spec.ts' },
  ],
  webServer: [
    {
      // Stripe's API as the panel reads it, so the order ingest runs end to end without the network.
      command: 'node tests/e2e/stripe-stub.ts',
      url: `http://127.0.0.1:${E2E_STRIPE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 10_000,
    },
    ...workers.map(worker => ({
      command: 'node scripts/serve-standalone.mjs',
      url: `http://127.0.0.1:${worker.port}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(worker.port),
        HOSTNAME: '127.0.0.1',
        ORIGIN_AUTH_SECRET: E2E_ORIGIN_SECRET,
        // The build carries a developer's `.env` along; this wins over its ORIGIN_AUTH_DISABLED=1, which production refuses.
        ORIGIN_AUTH_DISABLED: '0',
        DATABASE_URL: worker.appUrl,
        MEDIA_STORAGE_DIR: worker.mediaDir,
        ...E2E_AUTH_ENV,
        SITE_URL: worker.baseUrl,
        ...E2E_STRIPE_ENV,
      },
    })),
  ],
})
