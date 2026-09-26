export const E2E_PORT = 4331
export const E2E_ORIGIN_SECRET = 'e2e-origin-secret-0123456789abcdef0123456789abcdef'
export const E2E_CLIENT_IP = '203.0.113.10'

/** The auth settings of the e2e server; local test values only. */
export const E2E_AUTH_ENV = {
  SITE_URL: `http://localhost:${E2E_PORT}`,
  IP_HASH_KEY: 'e2e-ip-hash-key-0123456789abcdef0123456789',
  COOKIE_SIGNING_KEY: 'e2e-cookie-signing-key-0123456789abcdef0123',
  TOTP_ENCRYPTION_KEYS: 'e2e1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  OWNER_SETUP_TOKEN: 'e2e-owner-setup-token-0123456789abcdef0123456789',
}
