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
})
