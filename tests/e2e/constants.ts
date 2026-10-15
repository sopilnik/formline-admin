import { resolve } from 'node:path'

/**
 * Four workers run the suite, each against its own server, database and media folder, so the owner workspace, the
 * template and the rate-limit windows of one worker never meet another's. Playwright names a worker in
 * TEST_PARALLEL_INDEX (0 to 3, kept when a worker restarts after a failure); the config's own process has none and starts
 * every worker's server through `e2eWorker`. CI runs one: its runner has too few cores for four servers and browsers, and
 * the timing tests fail under that load.
 */
export const E2E_WORKERS = process.env.CI ? 1 : 4

// The ports of the four servers; 4334 is the Stripe stand-in's.
const PORTS = [4331, 4332, 4333, 4335]

export type E2eWorker = { port: number; baseUrl: string; database: string; migratorUrl: string; appUrl: string; mediaDir: string }

export function e2eWorker(index: number): E2eWorker {
  const port = PORTS[index]!
  const database = `formline_e2e_${index}`

  return {
    port,
    // localhost, not 127.0.0.1: passkeys need a host name as the relying party.
    baseUrl: `http://localhost:${port}`,
    database,
    migratorUrl: `postgres://postgres:postgres@127.0.0.1:55432/${database}`,
    appUrl: `postgres://app:app-local-password@127.0.0.1:56432/${database}`,
    // The folder that stands in for the media zone while the server runs. Absolute, from the repository root
    // the test commands run in: the standalone server changes its own directory.
    mediaDir: resolve('test-media', String(index)),
  }
}

const worker = e2eWorker(Number(process.env.TEST_PARALLEL_INDEX ?? 0))

export const E2E_BASE_URL = worker.baseUrl
export const E2E_ORIGIN_SECRET = 'e2e-origin-secret-0123456789abcdef0123456789abcdef'
export const E2E_CLIENT_IP = '203.0.113.10'
export const E2E_SESSION_COOKIE = '__Host-formline_session'
export const E2E_DEMO_COOKIE = '__Host-formline_demo'
export const E2E_MEDIA_DIR = worker.mediaDir

export const E2E_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres'
export const E2E_MIGRATOR_URL = worker.migratorUrl

/** The local stand-in for Stripe's API (tests/e2e/stripe-stub.ts), which every e2e server reads instead of Stripe. */
export const E2E_STRIPE_PORT = 4334

/** The Stripe ingest's settings of the e2e servers; local test values only. */
export const E2E_STRIPE_ENV = {
  STRIPE_WEBHOOK_SECRET: 'whsec_e2e-webhook-secret-0123456789abcdef',
  STRIPE_RESTRICTED_KEY: 'rk_test_e2e-restricted-key-0123456789abcdef',
  PSEUDONYM_KEY: 'e2e-pseudonym-key-0123456789abcdef0123456789',
  STRIPE_API_BASE: `http://127.0.0.1:${E2E_STRIPE_PORT}`,
}

/** The auth settings of this worker's server; local test values only. */
export const E2E_AUTH_ENV = {
  SITE_URL: E2E_BASE_URL,
  IP_HASH_KEY: 'e2e-ip-hash-key-0123456789abcdef0123456789',
  COOKIE_SIGNING_KEY: 'e2e-cookie-signing-key-0123456789abcdef0123',
  TOTP_ENCRYPTION_KEYS: 'e2e1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  OWNER_SETUP_TOKEN: 'e2e-owner-setup-token-0123456789abcdef0123456789',
}
