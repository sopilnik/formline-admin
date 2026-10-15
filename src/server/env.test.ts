import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readEnv } from '@/server/env'

const KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='
const base = {
  DATABASE_URL: 'postgres://app:secret@127.0.0.1:56432/formline_dev',
  IP_HASH_KEY: 'i'.repeat(32),
  COOKIE_SIGNING_KEY: 'c'.repeat(32),
  TOTP_ENCRYPTION_KEYS: `k1:${KEY}`,
}
const production = { ...base, NODE_ENV: 'production', ORIGIN_AUTH_SECRET: 'x'.repeat(64), SITE_URL: 'https://formline-admin.sopilnik.dev' }

/** Every key, secret or token a settings file of this repository publishes, under the setting it would be given as. */
function publishedSecrets(): { setting: string; value: string }[] {
  const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const lines = [
    ...read('.env.example').matchAll(/^([A-Z_]+)=(\S+)$/gm),
    ...['tests/e2e/constants.ts', 'tests/int/env.ts'].flatMap(file => [...read(file).matchAll(/^\s*(?:export const )?([A-Z0-9_]+)(?::| =) '([^']+)'/gm)]),
  ]

  return lines
    .map(([, name, value]) => ({ setting: name === 'E2E_ORIGIN_SECRET' ? 'ORIGIN_AUTH_SECRET' : name!, value: value! }))
    .filter(({ setting }) => /_(SECRET|KEYS?|TOKEN)$/.test(setting))
}

describe('readEnv', () => {
  it('requires the origin secret in production', () => {
    expect(() => readEnv({ ...production, ORIGIN_AUTH_SECRET: undefined })).toThrow(/ORIGIN_AUTH_SECRET/)
  })

  it('refuses to switch the origin check off in production', () => {
    expect(() => readEnv({ ...production, ORIGIN_AUTH_DISABLED: '1' })).toThrow(/ORIGIN_AUTH_DISABLED/)
  })

  it('accepts development without a secret', () => {
    expect(readEnv({ ...base, NODE_ENV: 'development', ORIGIN_AUTH_DISABLED: '1' }).NODE_ENV).toBe('development')
  })

  it('requires https for the site in production, localhost excepted', () => {
    expect(readEnv(production).SITE_URL).toBe('https://formline-admin.sopilnik.dev')
    expect(() => readEnv({ ...production, SITE_URL: 'http://formline-admin.sopilnik.dev' })).toThrow(/SITE_URL/)
    expect(readEnv({ ...production, SITE_URL: 'http://localhost:4331' }).SITE_URL).toBe('http://localhost:4331')
  })

  it('requires the auth keys in their formats', () => {
    expect(() => readEnv({ ...base, IP_HASH_KEY: 'short' })).toThrow(/IP_HASH_KEY/)
    expect(() => readEnv({ ...base, COOKIE_SIGNING_KEY: undefined })).toThrow(/COOKIE_SIGNING_KEY/)
    expect(() => readEnv({ ...base, TOTP_ENCRYPTION_KEYS: 'k1:not-base64' })).toThrow(/TOTP_ENCRYPTION_KEYS/)
    expect(() => readEnv({ ...base, OWNER_SETUP_TOKEN: 'too-short' })).toThrow(/OWNER_SETUP_TOKEN/)
  })

  it('takes the media zone as three variables together, on a bunny storage host', () => {
    const zone = { BUNNY_STORAGE_ZONE: 'formline-admin-media', BUNNY_STORAGE_HOST: 'storage.bunnycdn.com', BUNNY_STORAGE_KEY: 'k'.repeat(36) }

    expect(readEnv({ ...base, ...zone }).BUNNY_STORAGE_ZONE).toBe('formline-admin-media')
    expect(readEnv({ ...base, ...zone, BUNNY_STORAGE_HOST: 'uk.storage.bunnycdn.com' }).BUNNY_STORAGE_HOST).toBe('uk.storage.bunnycdn.com')
    expect(() => readEnv({ ...base, ...zone, BUNNY_STORAGE_HOST: 'storage.example.com' })).toThrow(/BUNNY_STORAGE_HOST/)
    expect(() => readEnv({ ...base, BUNNY_STORAGE_ZONE: 'formline-admin-media' })).toThrow(/go together/)
    expect(readEnv({ ...base, MEDIA_STORAGE_DIR: '.media' }).MEDIA_STORAGE_DIR).toBe('.media')
  })

  it('takes the Stripe ingest as three variables together, with a restricted test key', () => {
    // Built from parts, so the source never holds a string shaped like a real key.
    const ingest = { STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(32)}`, STRIPE_RESTRICTED_KEY: `rk_test_${'r'.repeat(32)}`, PSEUDONYM_KEY: 'p'.repeat(32) }

    expect(readEnv({ ...base, ...ingest }).STRIPE_RESTRICTED_KEY).toBe(ingest.STRIPE_RESTRICTED_KEY)
    expect(() => readEnv({ ...base, ...ingest, STRIPE_RESTRICTED_KEY: `rk_live_${'r'.repeat(32)}` })).toThrow(/rk_test_/)
    expect(() => readEnv({ ...base, ...ingest, STRIPE_RESTRICTED_KEY: `sk_test_${'r'.repeat(32)}` })).toThrow(/rk_test_/)
    expect(() => readEnv({ ...base, ...ingest, STRIPE_WEBHOOK_SECRET: 'w'.repeat(32) })).toThrow(/whsec_/)
    expect(() => readEnv({ ...base, ...ingest, PSEUDONYM_KEY: 'short' })).toThrow(/PSEUDONYM_KEY/)
    expect(() => readEnv({ ...base, STRIPE_WEBHOOK_SECRET: ingest.STRIPE_WEBHOOK_SECRET })).toThrow(/go together/)
  })

  it('takes a stand-in for the Stripe API anywhere in development, and only on a loopback address in production', () => {
    expect(readEnv({ ...base, STRIPE_API_BASE: 'http://stripe-stub.test:4334' }).STRIPE_API_BASE).toBe('http://stripe-stub.test:4334')
    expect(() => readEnv({ ...base, STRIPE_API_BASE: 'ftp://127.0.0.1' })).toThrow(/STRIPE_API_BASE/)
    expect(readEnv({ ...production, STRIPE_API_BASE: 'http://127.0.0.1:4334' }).STRIPE_API_BASE).toBe('http://127.0.0.1:4334')
    expect(readEnv({ ...production, STRIPE_API_BASE: 'http://[::1]:4334' }).STRIPE_API_BASE).toBe('http://[::1]:4334')
    expect(() => readEnv({ ...production, STRIPE_API_BASE: 'https://api.example.com' })).toThrow(/loopback/)
  })

  describe('in the container', () => {
    const container = {
      ...production,
      FORMLINE_RUNTIME: 'container',
      BUNNY_STORAGE_ZONE: 'formline-admin-media',
      BUNNY_STORAGE_HOST: 'storage.bunnycdn.com',
      BUNNY_STORAGE_KEY: 'k'.repeat(36),
      STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(32)}`,
      STRIPE_RESTRICTED_KEY: `rk_test_${'r'.repeat(32)}`,
      PSEUDONYM_KEY: 'p'.repeat(32),
      TOTP_ENCRYPTION_KEYS: `k1:${'K'.repeat(43)}=`,
    }

    it('accepts the deployed configuration', () => {
      expect(readEnv(container).FORMLINE_RUNTIME).toBe('container')
    })

    it('requires the media zone and the Stripe ingest', () => {
      expect(() => readEnv({ ...container, BUNNY_STORAGE_ZONE: undefined, BUNNY_STORAGE_HOST: undefined, BUNNY_STORAGE_KEY: undefined })).toThrow(/media zone is required/)
      expect(() => readEnv({ ...container, STRIPE_WEBHOOK_SECRET: undefined, STRIPE_RESTRICTED_KEY: undefined, PSEUDONYM_KEY: undefined })).toThrow(/Stripe ingest is required/)
    })

    it('refuses the local stand-ins, a site without https and a build that is not production', () => {
      expect(() => readEnv({ ...container, STRIPE_API_BASE: 'http://127.0.0.1:4334' })).toThrow(/STRIPE_API_BASE/)
      expect(() => readEnv({ ...container, MEDIA_STORAGE_DIR: '.media' })).toThrow(/MEDIA_STORAGE_DIR/)
      expect(() => readEnv({ ...container, SITE_URL: 'http://localhost:3000' })).toThrow(/https in the container/)
      expect(() => readEnv({ ...container, NODE_ENV: 'development' })).toThrow(/production in the container/)
    })

    it('refuses every placeholder secret this repository publishes', () => {
      const published = publishedSecrets()

      expect(published.length).toBeGreaterThanOrEqual(16)
      for (const { setting, value } of published) {
        expect(() => readEnv({ ...container, [setting]: value }), setting).toThrow(/a placeholder this repository publishes/)
      }
    })

    it('knows the maintenance flag and nothing else', () => {
      expect(readEnv({ ...container, FORMLINE_MAINTENANCE: '1' }).FORMLINE_MAINTENANCE).toBe('1')
      expect(() => readEnv({ ...container, FORMLINE_MAINTENANCE: 'yes' })).toThrow(/FORMLINE_MAINTENANCE/)
      expect(() => readEnv({ ...container, FORMLINE_RUNTIME: 'vm' })).toThrow(/FORMLINE_RUNTIME/)
    })
  })
})
