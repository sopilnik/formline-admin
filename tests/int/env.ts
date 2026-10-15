export const ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres'
export const TEST_DB = 'formline_test'
export const MIGRATOR_URL = `postgres://postgres:postgres@127.0.0.1:55432/${TEST_DB}`
export const APP_PASSWORD = 'app-local-password'
export const APP_POOLED_URL = `postgres://app:${APP_PASSWORD}@127.0.0.1:56432/${TEST_DB}`
export const APP_DIRECT_URL = `postgres://app:${APP_PASSWORD}@127.0.0.1:55432/${TEST_DB}`

/** The same address on another database, for the tests that make a database of their own. */
export function withDatabase(url: string, database: string): string {
  const address = new URL(url)

  address.pathname = `/${database}`

  return address.href
}

/** The auth settings every integration test runs with; local test values only. */
export const TEST_AUTH_ENV = {
  SITE_URL: 'http://localhost:4331',
  IP_HASH_KEY: 'test-ip-hash-key-0123456789abcdef0123456789',
  COOKIE_SIGNING_KEY: 'test-cookie-signing-key-0123456789abcdef0123',
  TOTP_ENCRYPTION_KEYS: 'test1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  OWNER_SETUP_TOKEN: 'test-owner-setup-token-0123456789abcdef0123456789',
}
