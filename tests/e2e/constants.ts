export const E2E_PORT = 4331
// localhost, not 127.0.0.1: passkeys need a host name as the relying party (task 2.8).
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
export const E2E_ORIGIN_SECRET = 'e2e-origin-secret-0123456789abcdef0123456789abcdef'
export const E2E_CLIENT_IP = '203.0.113.10'
export const E2E_SESSION_COOKIE = '__Host-formline_session'
export const E2E_DEMO_COOKIE = '__Host-formline_demo'

export const E2E_DB = 'formline_e2e'
export const E2E_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres'
export const E2E_MIGRATOR_URL = `postgres://postgres:postgres@127.0.0.1:55432/${E2E_DB}`
export const E2E_APP_URL = `postgres://app:app-local-password@127.0.0.1:56432/${E2E_DB}`

/** The auth settings of the e2e server; local test values only. */
export const E2E_AUTH_ENV = {
  SITE_URL: E2E_BASE_URL,
  IP_HASH_KEY: 'e2e-ip-hash-key-0123456789abcdef0123456789',
  COOKIE_SIGNING_KEY: 'e2e-cookie-signing-key-0123456789abcdef0123',
  TOTP_ENCRYPTION_KEYS: 'e2e1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  OWNER_SETUP_TOKEN: 'e2e-owner-setup-token-0123456789abcdef0123456789',
}
